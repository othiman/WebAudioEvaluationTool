/* globals document, console, DOMParser */
function Specification() {
    var schemaRoot;
    var schemaString;
    // Handles the decoding of the project specification XML into a simple JavaScript Object.

    // <setup> attributes
    this.interface = undefined;
    this.projectReturn = undefined;
    this.returnURL = undefined;
    this.randomiseOrder = undefined;
    this.poolSize = undefined;
    this.loudness = undefined;
    this.sampleRate = undefined;
    this.calibration = undefined;
    this.crossFade = undefined;
    this.preSilence = undefined;
    this.postSilence = undefined;
    this.playOne = undefined;

    // nodes
    this.metrics = undefined;
    this.preTest = undefined;
    this.postTest = undefined;
    this.pages = [];
    this.interfaces = undefined;
    this.errors = [];
    this.exitText = "Thank you.";

    var processAttribute = function (attribute, schema) {
        // attribute is the string returned from getAttribute on the XML
        // schema is the <xs:attribute> node
        if (schema.getAttribute('name') === null && schema.getAttribute('ref') !== undefined) {
            schema = schemaRoot.getAllElementsByName(schema.getAttribute('ref'))[0];
        }
        var defaultOpt = schema.getAttribute('default');
        if (attribute === null) {
            attribute = defaultOpt;
        }
        var dataType = schema.getAttribute('type');
        if (typeof dataType == "string") {
            dataType = dataType.substr(3);
        } else {
            var rest = schema.getAllElementsByTagName("xs:restriction").concat(schema.getAllElementsByTagName("xs:enumeration"));
            if (rest.length > 0) {
                dataType = rest[0].getAttribute("base");
                if (typeof dataType == "string") {
                    dataType = dataType.substr(3);
                } else {
                    dataType = "string";
                }
            } else {
                dataType = "string";
            }
        }
        if (attribute === null) {
            return attribute;
        }
        switch (dataType) {
            case "boolean":
                if (attribute == 'true') {
                    attribute = true;
                } else {
                    attribute = false;
                }
                break;
            case "negativeInteger":
            case "positiveInteger":
            case "nonNegativeInteger":
            case "nonPositiveInteger":
            case "integer":
            case "decimal":
            case "short":
                attribute = Number(attribute);
                break;
            default:
                attribute = String(attribute);
                break;
        }
        return attribute;
    };

    this.processSchema = function (schemaXSD) {
        if (schemaRoot === undefined) {
            schemaString = schemaXSD;
            var parse = new DOMParser();
            schemaRoot = parse.parseFromString(schemaString, 'text/xml');
            Object.defineProperties(this, {
                'schema': {
                    'value': schemaRoot
                },
                'schemaString': {
                    'value': schemaString
                }
            });
        }
    };
    this.getSchema = function () {
        return schemaRoot;
    };
    this.getSchemaString = function () {
        return schemaString;
    };

    this.decode = function (projectXML) {
        schemaRoot = this.schema;
        this.errors = [];
        // projectXML - DOM Parsed document
        this.projectXML = projectXML.childNodes[0];
        var setupNode = projectXML.getElementsByTagName('setup')[0];
        var schemaSetup = schemaRoot.getAllElementsByName('setup')[0];
        // First decode the attributes
        var attributes = schemaSetup.getAllElementsByTagName('xs:attribute');
        var i;
        for (i = 0; i < attributes.length; i++) {
            var attributeName = attributes[i].getAttribute('name') || attributes[i].getAttribute('ref');
            var projectAttr = setupNode.getAttribute(attributeName);
            projectAttr = processAttribute(projectAttr, attributes[i]);
            if (projectAttr !== null) {
                this[attributeName] = projectAttr;
            }

        }

        var exitTextNode = setupNode.getElementsByTagName('exitText');
        if (exitTextNode.length == 1) {
            this.exitText = exitTextNode[0].textContent;
        }

        this.metrics = new this.metricNode();

        this.metrics.decode(this, setupNode.getElementsByTagName('metric')[0]);

        // Now process the survey node options
        var survey = setupNode.getElementsByTagName('survey');
        for (i = 0; i < survey.length; i++) {
            var location = survey[i].getAttribute('location');
            switch (location) {
                case 'pre':
                case 'before':
                    this.preTest = new this.surveyNode(this);
                    this.preTest.decode(this, survey[i]);
                    break;
                case 'post':
                case 'after':
                    this.postTest = new this.surveyNode(this);
                    this.postTest.decode(this, survey[i]);
                    break;
            }
        }

        var interfaceNode = setupNode.getElementsByTagName('interface');
        if (interfaceNode.length > 1) {
            this.errors.push("Only one <interface> node in the <setup> node allowed! Others except first ingnored!");
        }
        this.interfaces = new this.interfaceNode(this);
        if (interfaceNode.length !== 0) {
            interfaceNode = interfaceNode[0];
            this.interfaces.decode(this, interfaceNode, this.schema.getAllElementsByName('interface')[1]);
        }

        // Page tags
        var pageTags = projectXML.getElementsByTagName('page');
        var pageSchema = this.schema.getAllElementsByName('page')[0];
        for (i = 0; i < pageTags.length; i++) {
            var node = new this.page(this);
            node.decode(this, pageTags[i], pageSchema);
            this.pages.push(node);
        }
    };

    this.encode = function () {
        var RootDocument = document.implementation.createDocument(null, "waet");
        var root = RootDocument.firstChild;
        root.setAttribute("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance");
        root.setAttribute("xsi:noNamespaceSchemaLocation", "test-schema.xsd");
        // Build setup node
        var setup = RootDocument.createElement("setup");
        var schemaSetup = schemaRoot.getAllElementsByName('setup')[0];
        // First decode the attributes
        var attributes = schemaSetup.getAllElementsByTagName('xs:attribute');
        for (var i = 0; i < attributes.length; i++) {
            var name = attributes[i].getAttribute("name");
            if (name === undefined) {
                name = attributes[i].getAttribute("ref");
            }
            if (this[name] !== undefined || attributes[i].getAttribute("use") == "required") {
                setup.setAttribute(name, this[name]);
            }
        }
        root.appendChild(setup);
        // Survey node
        if (this.exitText !== null) {
            var exitTextNode = RootDocument.createElement('exitText');
            exitTextNode.textContent = this.exitText;
            setup.appendChild(exitTextNode);
        }
        setup.appendChild(this.preTest.encode(RootDocument));
        setup.appendChild(this.postTest.encode(RootDocument));
        setup.appendChild(this.metrics.encode(RootDocument));
        setup.appendChild(this.interfaces.encode(RootDocument));
        this.pages.forEach(function (page) {
            root.appendChild(page.encode(RootDocument));
        });
        return RootDocument;
    };

    this.surveyNode = function (specification) {
        this.location = undefined;
        this.options = [];
        this.parent = undefined;
        this.schema = schemaRoot.getAllElementsByName('survey')[0];
        this.specification = specification;

        this.OptionNode = function (specification) {
            this.type = undefined;
            this.schema = undefined;
            this.id = undefined;
            this.name = undefined;
            this.mandatory = undefined;
            this.statement = undefined;
            this.boxsize = undefined;
            this.options = [];
            this.min = undefined;
            this.max = undefined;
            this.step = undefined;
            this.conditions = [];

            this.decode = function (parent, child) {
                this.schema = schemaRoot.getAllElementsByName(child.nodeName)[0];
                var attributeMap = this.schema.getAllElementsByTagName('xs:attribute');
                var i;
                for (i in attributeMap) {
                    if (isNaN(Number(i)) === true) {
                        break;
                    }
                    var attributeName = attributeMap[i].getAttribute('name') || attributeMap[i].getAttribute('ref');
                    var projectAttr = child.getAttribute(attributeName);
                    projectAttr = processAttribute(projectAttr, attributeMap[i]);
                    if (projectAttr !== null) {
                        this[attributeName] = projectAttr;
                    }
                }
                if (child.nodeName == 'surveyentry') {
                    console.log("NOTE - Use of <surveyelement> is now deprecated. Whilst these will still work, newer nodes and tighter error checking will not be enforced");
                    console.log("Please use the newer, type specifc nodes");
                    if (!this.type) {
                        throw ("Type not specified");
                    }
                } else {
                    this.type = child.nodeName.split('survey')[1];
                }
                this.statement = child.getElementsByTagName('statement')[0].textContent;
                if (this.type == "checkbox" || this.type == "radio") {
                    var children = child.getElementsByTagName('option');
                    if (children.length === null) {
                        console.log('Malformed' + child.nodeName + 'entry');
                        this.statement = 'Malformed' + child.nodeName + 'entry';
                        this.type = 'statement';
                    } else {
                        this.options = [];
                        for (i = 0; i < children.length; i++) {
                            this.options.push({
                                name: children[i].getAttribute('name'),
                                text: children[i].textContent
                            });
                        }
                    }
                } else if (this.type == "slider") {
                    this.leftText = "";
                    this.rightText = "";
                    var minText = child.getElementsByTagName("minText");
                    var maxText = child.getElementsByTagName("maxText");
                    if (minText.length > 0) {
                        this.leftText = minText[0].textContent;
                    }
                    if (maxText.length > 0) {
                        this.rightText = maxText[0].textContent;
                    }
                }
                var conditionElements = child.getElementsByTagName("conditional");
                for (i = 0; i < conditionElements.length; i++) {
                    var condition = conditionElements[i];
                    var obj = {
                        check: condition.getAttribute("check"),
                        value: condition.getAttribute("value"),
                        jumpToOnPass: condition.getAttribute("jumpToOnPass"),
                        jumpToOnFail: condition.getAttribute("jumpToOnFail")
                    };
                    this.conditions.push(obj);
                }
            };

            this.exportXML = function (doc) {
                var node = doc.createElement('survey' + this.type);
                var statement = doc.createElement('statement');
                statement.textContent = this.statement;
                node.appendChild(statement);
                node.id = this.id;
                if (this.name !== undefined) {
                    node.setAttribute("name", this.name);
                }
                if (this.mandatory !== undefined) {
                    node.setAttribute("mandatory", this.mandatory);
                }
                node.id = this.id;
                if (this.name !== undefined) {
                    node.setAttribute("name", this.name);
                }
                switch (this.type) {
                    case "checkbox":
                        if (this.min !== undefined) {
                            node.setAttribute("min", this.min);
                        } else {
                            node.setAttribute("min", "0");
                        }
                        if (this.max !== undefined) {
                            node.setAttribute("max", this.max);
                        } else {
                            node.setAttribute("max", "undefined");
                        } /* falls through */
                    case "radio":
                        for (var i = 0; i < this.options.length; i++) {
                            var option = this.options[i];
                            var optionNode = doc.createElement("option");
                            optionNode.setAttribute("name", option.name);
                            optionNode.textContent = option.text;
                            node.appendChild(optionNode);
                        }
                        break;
                    case "number":
                        if (this.min !== undefined) {
                            node.setAttribute("min", this.min);
                        }
                        if (this.max !== undefined) {
                            node.setAttribute("max", this.max);
                        }
                        break;
                    case "question":
                        if (this.boxsize !== undefined) {
                            node.setAttribute("boxsize", this.boxsize);
                        }
                        if (this.mandatory !== undefined) {
                            node.setAttribute("mandatory", this.mandatory);
                        }
                        break;
                    case "video":
                        if (this.mandatory !== undefined) {
                            node.setAttribute("mandatory", this.mandatory);
                        } /* falls through */
                    case "youtube":
                        if (this.url !== undefined) {
                            node.setAttribute("url", this.url);
                        }
                        break;
                    case "slider":
                        node.setAttribute("min", this.min);
                        node.setAttribute("max", this.max);
                        if (this.leftText) {
                            var minText = doc.createElement("minText");
                            minText.textContent = this.leftText;
                            node.appendChild(minText);
                        }
                        if (this.rightText) {
                            var maxText = doc.createElement("maxText");
                            maxText.textContent = this.rightText;
                            node.appendChild(maxText);
                        }
                        break;
                    default:
                        break;
                }
                this.conditions.forEach(function (condition) {
                    var conditionDOM = doc.createElement("conditional");
                    conditionDOM.setAttribute("check", condition.check);
                    conditionDOM.setAttribute("value", condition.value);
                    conditionDOM.setAttribute("jumpToOnPass", condition.jumpToOnPass);
                    conditionDOM.setAttribute("jumpToOnFail", condition.jumpToOnFail);
                    node.appendChild(conditionDOM);
                });
                return node;
            };
        };
        this.decode = function (parent, xml) {
            this.parent = parent;
            this.location = xml.getAttribute('location');
            if (this.location == 'before') {
                this.location = 'pre';
            } else if (this.location == 'after') {
                this.location = 'post';
            }
            var child = xml.firstElementChild;
            while (child) {
                var node = new this.OptionNode(this.specification);
                node.decode(parent, child);
                this.options.push(node);
                child = child.nextElementSibling;
            }
            if (this.options.length === 0) {
                console.log("Empty survey node");
                console.log(this);
            }
        };
        this.encode = function (doc) {
            var node = doc.createElement('survey');
            node.setAttribute('location', this.location);
            for (var i = 0; i < this.options.length; i++) {
                node.appendChild(this.options[i].exportXML(doc));
            }
            return node;
        };
    };

    this.interfaceNode = function (specification) {
        this.title = undefined;
        this.name = undefined;
        this.options = [];
        this.scales = [];
        this.schema = schemaRoot.getAllElementsByName('interface')[1];

        this.decode = function (parent, xml) {
            this.name = xml.getAttribute('name');
            var titleNode = xml.getElementsByTagName('title');
            if (titleNode.length == 1) {
                this.title = titleNode[0].textContent;
            }
            var interfaceOptionNodes = xml.getElementsByTagName('interfaceoption');
            // Extract interfaceoption node schema
            var interfaceOptionNodeSchema = this.schema.getAllElementsByName('interfaceoption')[0];
            var attributeMap = interfaceOptionNodeSchema.getAllElementsByTagName('xs:attribute');
            var i, j;
            for (i = 0; i < interfaceOptionNodes.length; i++) {
                var ioNode = interfaceOptionNodes[i];
                var option = {};
                for (j = 0; j < attributeMap.length; j++) {
                    var attributeName = attributeMap[j].getAttribute('name') || attributeMap[j].getAttribute('ref');
                    var projectAttr = ioNode.getAttribute(attributeName);
                    projectAttr = processAttribute(projectAttr, attributeMap[j]);
                    if (projectAttr !== null) {
                        option[attributeName] = projectAttr;
                    }
                }
                this.options.push(option);
            }

            // Now the scales nodes
            var scaleParent = xml.getElementsByTagName('scales');
            if (scaleParent.length == 1) {
                scaleParent = scaleParent[0];
                var scalelabels = scaleParent.getAllElementsByTagName('scalelabel');
                for (i = 0; i < scalelabels.length; i++) {
                    this.scales.push({
                        text: scalelabels[i].textContent,
                        position: Number(scalelabels[i].getAttribute('position'))
                    });
                }
            }
        };

        this.encode = function (doc) {
            var node = doc.createElement("interface");
            if (typeof this.name == "string" && this.name.length > 0)
                node.setAttribute("name", this.name);
            if (typeof this.title == "string") {
                var titleNode = doc.createElement("title");
                titleNode.textContent = this.title;
                node.appendChild(titleNode);
            }
            this.options.forEach(function (option) {
                var child = doc.createElement("interfaceoption");
                child.setAttribute("type", option.type);
                child.setAttribute("name", option.name);
                node.appendChild(child);
            });
            if (this.scales.length !== 0) {
                var scales = doc.createElement("scales");
                this.scales.forEach(function (scale) {
                    var child = doc.createElement("scalelabel");
                    child.setAttribute("position", scale.position);
                    child.textContent = scale.text;
                    scales.appendChild(child);
                });
                node.appendChild(scales);
            }
            return node;
        };
    };

    this.metricNode = function () {
        this.enabled = [];
        this.decode = function (parent, xml) {
            var children = xml.getElementsByTagName('metricenable');
            for (var i in children) {
                if (isNaN(Number(i)) === true) {
                    break;
                }
                this.enabled.push(children[i].textContent);
            }
        };
        this.encode = function (doc) {
            var node = doc.createElement('metric');
            for (var i in this.enabled) {
                if (isNaN(Number(i)) === true) {
                    break;
                }
                var child = doc.createElement('metricenable');
                child.textContent = this.enabled[i];
                node.appendChild(child);
            }
            return node;
        };
    };

    this.page = function (specification) {
        this.presentedId = undefined;
        this.id = undefined;
        this.title = undefined;
        this.hostURL = undefined;
        this.randomiseOrder = undefined;
        this.loop = undefined;
        this.outsideReference = undefined;
        this.loudness = undefined;
        this.label = undefined;
        this.labelStart = undefined;
        this.preTest = undefined;
        this.postTest = undefined;
        this.interfaces = [];
        this.playOne = undefined;
        this.restrictMovement = undefined;
        this.position = undefined;
        this.commentBoxPrefix = "Comment on track";
        this.audioElements = [];
        this.commentQuestions = [];
        this.schema = schemaRoot.getAllElementsByName("page")[0];
        this.specification = specification;
        this.parent = undefined;

        this.decode = function (parent, xml) {
            this.parent = parent;
            var attributeMap = this.schema.getAllElementsByTagName('xs:attribute');
            var i, node;
            for (i = 0; i < attributeMap.length; i++) {
                var attributeName = attributeMap[i].getAttribute('name') || attributeMap[i].getAttribute('ref');
                var projectAttr = xml.getAttribute(attributeName);
                projectAttr = processAttribute(projectAttr, attributeMap[i]);
                if (projectAttr !== null) {
                    this[attributeName] = projectAttr;
                }
            }

            // Get the title
            var title = xml.getElementsByTagName('title');
            if (title.length !== 0 && title[0].parentElement == xml) {
                this.title = title[0].textContent;
            }

            // Get the Comment Box Prefix
            var CBP = xml.getElementsByTagName('commentboxprefix');
            if (CBP.length !== 0 && CBP[0].parentElement == xml) {
                this.commentBoxPrefix = CBP[0].textContent;
            }

            // Now decode the interfaces
            var interfaceNode = xml.getElementsByTagName('interface');
            for (i = 0; i < interfaceNode.length; i++) {
                node = new parent.interfaceNode(this.specification);
                node.decode(this, interfaceNode[i], parent.schema.getAllElementsByName('interface')[1]);
                this.interfaces.push(node);
            }

            // Now process the survey node options
            var survey = xml.getElementsByTagName('survey');
            var surveySchema = parent.schema.getAllElementsByName('survey')[0];
            for (i = 0; i < survey.length; i++) {
                var location = survey[i].getAttribute('location');
                if (location == 'pre' || location == 'before') {
                    if (this.preTest !== undefined) {
                        this.errors.push("Already a pre/before test survey defined! Ignoring second!!");
                    } else {
                        this.preTest = new parent.surveyNode(this.specification);
                        this.preTest.decode(parent, survey[i], surveySchema);
                    }
                } else if (location == 'post' || location == 'after') {
                    if (this.postTest !== undefined) {
                        this.errors.push("Already a post/after test survey defined! Ignoring second!!");
                    } else {
                        this.postTest = new parent.surveyNode(this.specification);
                        this.postTest.decode(parent, survey[i], surveySchema);
                    }
                }
            }

            // Now process the audioelement tags
            var audioElements = xml.getElementsByTagName('audioelement');
            for (i = 0; i < audioElements.length; i++) {
                var audioNode = new this.audioElementNode(this.specification);
                audioNode.decode(this, audioElements[i]);
                this.audioElements.push(audioNode);
            }

            // Now decode the commentquestions
            var cqNode = xml.getElementsByTagName('commentquestions');
            if (cqNode.length !== 0) {
                cqNode = cqNode[0];
                var commentQuestion = cqNode.firstElementChild;
                while (commentQuestion) {
                    node = new this.commentQuestionNode(this.specification);
                    node.decode(parent, commentQuestion);
                    this.commentQuestions.push(node);
                    commentQuestion = commentQuestion.nextElementSibling;
                }
            }
        };

        this.encode = function (root) {
            var AHNode = root.createElement("page");
            // First decode the attributes
            var attributes = this.schema.getAllElementsByTagName('xs:attribute');
            var i;
            for (i = 0; i < attributes.length; i++) {
                var name = attributes[i].getAttribute("name");
                if (name === null) {
                    name = attributes[i].getAttribute("ref");
                }
                if (this[name] !== undefined || attributes[i].getAttribute("use") == "required") {
                    AHNode.setAttribute(name, this[name]);
                }
            }
            // <commentboxprefix>
            var commentboxprefix = root.createElement("commentboxprefix");
            commentboxprefix.textContent = this.commentBoxPrefix;
            AHNode.appendChild(commentboxprefix);

            for (i = 0; i < this.interfaces.length; i++) {
                AHNode.appendChild(this.interfaces[i].encode(root));
            }

            for (i = 0; i < this.audioElements.length; i++) {
                AHNode.appendChild(this.audioElements[i].encode(root));
            }
            // Create <CommentQuestion>
            for (i = 0; i < this.commentQuestions.length; i++) {
                AHNode.appendChild(this.commentQuestions[i].encode(root));
            }

            AHNode.appendChild(this.preTest.encode(root));
            AHNode.appendChild(this.postTest.encode(root));
            return AHNode;
        };

        this.commentQuestionNode = function (specification) {
            this.id = undefined;
            this.name = undefined;
            this.type = undefined;
            this.statement = undefined;
            this.schema = schemaRoot.getAllElementsByName('commentquestion')[0];
            this.decode = function (parent, xml) {
                this.id = xml.id;
                this.name = xml.getAttribute('name');
                if (this.name === null) {
                    this.name = undefined;
                }
                switch (xml.nodeName) {
                    case "commentradio":
                        this.type = "radio";
                        this.options = [];
                        break;
                    case "commentcheckbox":
                        this.type = "checkbox";
                        this.options = [];
                        break;
                    case "commentslider":
                        this.type = "slider";
                        this.min = undefined;
                        this.max = undefined;
                        this.step = undefined;
                        break;
                    case "commentquestion":
                        this.type = "question";
                        break;
                    default:
                        throw ("Unknown comment type " + xml.nodeName);
                }
                this.statement = xml.getElementsByTagName('statement')[0].textContent;
                if (this.type == "radio" || this.type == "checkbox") {
                    var optNodes = xml.getElementsByTagName('option');
                    for (var i = 0; i < optNodes.length; i++) {
                        var optNode = optNodes[i];
                        this.options.push({
                            name: optNode.getAttribute('name'),
                            text: optNode.textContent
                        });
                    }
                }
                if (this.type == "slider") {
                    this.min = Number(xml.getAttribute("min"));
                    this.max = Number(xml.getAttribute("max"));
                    this.step = Number(xml.getAttribute("step"));
                    if (this.step === undefined) {
                        this.step = 1;
                    }
                    this.value = Number(xml.getAttribute("value"));
                    if (this.value === undefined) {
                        this.value = this.min;
                    }
                    this.leftText = xml.getElementsByTagName("minText");
                    if (this.leftText && this.leftText.length > 0) {
                        this.leftText = this.leftText[0].textContent;
                    } else {
                        this.leftText = "";
                    }
                    this.rightText = xml.getElementsByTagName("maxText");
                    if (this.rightText && this.rightText.length > 0) {
                        this.rightText = this.rightText[0].textContent;
                    } else {
                        this.rightText = "";
                    }
                }
            };

            this.encode = function (root) {
                var node;
                switch (this.type) {
                    case "radio":
                        node = root.createElement("commentradio");
                        break;
                    case "checkbox":
                        node = root.createElement("commentcheckbox");
                        break;
                    case "slider":
                        node = root.createElement("commentslider");
                        break;
                    case "question":
                        node = root.createElement("commentquestion");
                        break;
                    default:
                        throw ("Unknown type " + this.type);
                }
                node.id = this.id;
                node.setAttribute("type", this.type);
                if (this.name !== undefined) {
                    node.setAttribute("name", this.name);
                }
                var statement = root.createElement("statement");
                statement.textContent = this.statement;
                node.appendChild(statement);
                if (this.type == "radio" || this.type == "checkbox") {
                    this.options.forEach(function (option) {
                        var child = root.createElement("option");
                        child.setAttribute("name", option.name);
                        child.textContent = option.text;
                        node.appendChild(child);
                    });
                }
                if (this.type == "slider") {
                    node.setAttribute("min", this.min);
                    node.setAttribute("max", this.max);
                    if (this.step !== 1) {
                        node.setAttribute("step", this.step);
                    }
                    if (this.value !== this.min) {
                        node.setAttribute("value", this.value);
                    }
                    if (this.leftText.length > 0) {
                        var leftText = root.createElement("minText");
                        leftText.textContent = this.leftText;
                        node.appendChild(leftText);
                    }
                    if (this.rightText.length > 0) {
                        var rightText = root.createElement("maxText");
                        rightText.textContent = this.rightText;
                        node.appendChild(rightText);
                    }
                }
                return node;
            };
        };

        this.audioElementNode = function (specification) {
            this.url = undefined;
            this.id = undefined;
            this.name = undefined;
            this.parent = undefined;
            this.type = undefined;
            this.marker = undefined;
            this.enforce = false;
            this.gain = 0.0;
            this.label = undefined;
            this.startTime = undefined;
            this.stopTime = undefined;
            this.sampleRate = undefined;
            this.alternatives = [];
            this.schema = schemaRoot.getAllElementsByName('audioelement')[0];
            this.parent = undefined;
            this.decode = function (parent, xml) {
                this.parent = parent;
                var attributeMap = this.schema.getAllElementsByTagName('xs:attribute');
                for (var i = 0; i < attributeMap.length; i++) {
                    var attributeName = attributeMap[i].getAttribute('name') || attributeMap[i].getAttribute('ref');
                    var projectAttr = xml.getAttribute(attributeName);
                    projectAttr = processAttribute(projectAttr, attributeMap[i]);
                    if (projectAttr !== null) {
                        this[attributeName] = projectAttr;
                    }
                }
                // Get the alternative nodes
                var child = xml.firstElementChild;
                while (child) {
                    if (child.nodeName == "alternative") {
                        this.alternatives.push({
                            'url': child.getAttribute("url"),
                            'sampleRate': child.getAttribute("sampleRate")
                        });
                    }
                    child = child.nextElementSibling;
                }

            };
            this.encode = function (root) {
                var AENode = root.createElement("audioelement");
                var attributes = this.schema.getAllElementsByTagName('xs:attribute');
                for (var i = 0; i < attributes.length; i++) {
                    var name = attributes[i].getAttribute("name");
                    if (name === null) {
                        name = attributes[i].getAttribute("ref");
                    }
                    if (this[name] !== undefined || attributes[i].getAttribute("use") == "required") {
                        AENode.setAttribute(name, this[name]);
                    }
                }
                this.alternatives.forEach(function (alt) {
                    var node = root.createElement("alternative");
                    node.setAttribute("url", alt.url);
                    node.setAttribute("sampleRate", alt.sampleRate);
                    AENode.appendChild(node);
                });
                return AENode;
            };
        };
    };
}
