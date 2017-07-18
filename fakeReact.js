var FakeReact = (function() {
    /*
        Dollar sign implies a real dom node.
        No dollar sign implies a VDOM node.
    */
    var stub = {};

    stub.onRenderHooks = [];

    function setBooleanProp($target, key, value) {
        if (value) {
            $target.setAttribute(key, value);
            $target[key] = true;
        } else {
            $target[key] = false;
        }
    }

    function removeBooleanProp($target, key) {
        $target.removeAttribute(key);
        $target[key] = false;
    }

    function removeProp($target, key, value) {
        if (isCustomProp) {
            return;
        } else if (name === 'className') {
            $target.removeAttribute('class');
        } else if (typeof value === 'boolean') {
            removeBooleanProp($target, key);
        } else {
            $target.removeAttribute(key);
        }
    }

    /*
        Diffing algorithm for the node's props.
        (1) If the prop doesn't exist on the new node, remove it.
        (2) If the prop exists on the new node but not in the old node, set it.
        (3) If the prop exists on both but have different values, set it.
        (4) Do nothing in any other case.
    */
    function updateProp($target, key, newVal, oldVal) {
        if (!newVal) {
            removeProp($target, key, oldVal);
        } else if (!oldVal || newVal !== oldVal) {
            setProp($target, key, newVal);
        }
    }

    function isCustomProp(key) {
        return isEventProp(key);
    }

    function isEventProp(key) {
        return /^on/.test(key);
    }

    function extractEventName(key) {
        return key.slice(2).toLowerCase();
    }

    function addEventListeners($target, props) {
        Object.keys(props).forEach(function(key) {
            if (isEventProp(key)) {
                $target.addEventListener(
                    extractEventName(key),
                    props[key]
                )
            }
        });
    }

    function setProp($target, key, value) {
        if (isCustomProp(key)) {
            return;
        } else if (key === 'className') {
            var id = value.match(/(^\w+)/)[0];
            $target.setAttribute('class', value);
            if (/^[A-Z]{1}/.test(id)) { $target.setAttribute('id', id); }
        } else if (typeof value === 'boolean') {
            setBooleanProp($target, key, value);
        } else {
            $target.setAttribute(key, value);
        }
    }

    function setProps($target, props) {
        Object.keys(props).forEach(function(key) {
            setProp($target, key, props[key]);
        });
    }

    function updateProps($target, newProps, oldProps = {}) {
        var props = Object.assign({}, newProps, oldProps);
        Object.keys(props).forEach(function(key) {
            updateProp($target, key, newProps[key], oldProps[key]);
        });
    }

    /*
        Cases:
        (1) one node is a string, the other a VDOM (perhaps a string was replaced with a VDOM node, or vice-versa)
        (2) the nodes are of the same type, are both strings, but have different values
        (3) the nodes are not strings, and are therefore VDOM nodes, but have different VDOM types
    */
    function changed(newNode, oldNode) {
        return typeof newNode !== typeof oldNode
            || typeof newNode === 'string' && newNode !== oldNode
            || newNode.type !== oldNode.type;
    }

    stub.createElement = function(node) {
        if (typeof node === 'string') {
            return document.createTextNode(node);
        }

        // we know it's a class member if it has a render function
        if (node.render) {
            if (node.onRender) stub.onRenderHooks.push(node.onRender);
            return stub.createElement(node.render());
        }

        var $el = document.createElement(node.type);
        setProps($el, node.props);
        addEventListeners($el, node.props);
        return node.children
            .map(stub.createElement)
            .reduce(function(acc, $childEl) {
                acc.appendChild($childEl);
                return acc;
            }, $el);
    };

    /*
        Diffing algorithm for the VDOM trees.
        A node in the new tree and not in the old tree implies that the node was added.
        A node in the old tree and not in the new tree implies that the node was removed.
        A node in the new tree that's different from the node in the old tree implies a change.
        Identical nodes in both trees implies that we must drill down further for changes.
    */
    stub.updateElement = function($parent, newNode, oldNode, index = 0) {
        if (!oldNode) {
            $newNode = stub.createElement(newNode);
            setProps($newNode, newNode.props);
            $parent.appendChild($newNode);
        } else if (!newNode) {
            $parent.removeChild($parent.childNodes(index));
        } else if (changed(newNode, oldNode)) {
            $newNode = stub.createElement(newNode);
            setProps($newNode, newNode.props);
            $parent.replaceChild($newNode, $parent.childNodes[index]);
        // depth-first traversal of both VDOM trees
        } else if (newNode.type) {
            updateProps(
                $parent.childNodes[index],
                newNode.props,
                oldNode.props
            );
            var newLength = newNode.children.length;
            var oldLength = oldNode.children.length;
            for (var i = 0; i < newLength || i < oldLength; i++) {
                stub.updateElement(
                    $parent.childNodes[index],
                    newNode.children[i],
                    oldNode.children[i]
                );
            }
        }
    };

    /*
        (1) Capture the old VDOM node.
        (2) Update state.
        (3) Retrieve the updated VDOM node.
        (4) Call updateElement.
    */
    function render(prevState, nextState, rootComponent) {
        var oldNode = rootComponent.render();
        rootComponent.state = Object.assign(prevState, nextState);
        var newNode = rootComponent.render();
        stub.updateElement(
            document.getElementById('root'),
            newNode,
            oldNode
        );
    }

    /*
        setState must be called with the component's 'this' to bind it the function and manipulate its state.
    */
    stub.setState = function(nextState) {
        var componentSelf = this;
        var prevState = componentSelf.state;
        render(prevState, nextState, componentSelf);
    };

    stub.mount = function(rootComponent) {
        var rootComponentInstance = new rootComponent();
        rootComponentInstance.onInit();
        var $root = document.getElementById('root');
        $root.appendChild(stub.createElement(rootComponentInstance.render()));
        // onRenderHooks are executed once we append the tree to the $root
        stub.onRenderHooks.forEach(function(hook) { hook() });
    }

    return stub;
})();

function Button(props = {}) {
    var onClick = props.onClick;
    return {
        type: 'div',
        props: {
            className: 'row'
        },
        children: [
            {
                type: 'div',
                props: {
                    className: 'col'
                },
                children: [
                    {
                        type: 'button',
                        props: {
                            className: 'Button',
                            onClick: onClick
                        },
                        children: [
                            'Click me!'
                        ]
                    }
                ]
            }
        ]
    };
}

function Comment(props = {}) {
    var comment = props.comment || {};
    var output = {
        type: 'li',
        props: {
            className: 'Comment' + props.isRedClass
        },
        children: [
            '[' + comment.title + ']' + comment.body
        ]
    };
    return output;
}

function Comments(props = {}) {
    var isRedClass = props.isRed ? " isRed" : "";
    return {
        type: 'div',
        props: {
            className: 'row'
        },
        children: [
            {
                type: 'div',
                props: {
                    className: 'col'
                },
                children: [
                    {
                        type: 'ul',
                        props: {
                            className: 'Comments'
                        },
                        // cannot be an array of arrays; must always be an array of objects
                        children: props.comments.map(function(comment) {
                            return Comment({isRedClass: isRedClass, comment: comment});
                        })
                    }
                ]
            }
        ]
    };
}

var CommentsBox = (function(react, Comments, Button) {
    return function(props = {}) {
        var self = this;

        self.onInit = function() {
            self.state = {
                comments: [{
                    title: 'first comment',
                    body: 'first'
                }],
                isRed: false
            };
        };

        self.onRender = function() {
            console.log("From CommentsBox!");
        };

        self.updateCommentColor = function(ev) {
            ev.preventDefault();
            react.setState.call(self, { isRed: !self.state.isRed });
        }

        self.render = function() {
            return {
                type: 'div',
                props: {
                    className: 'CommentsBox' + ' row'
                }, 
                children: [
                    {
                        type: 'div',
                        props: {
                            className: 'col'
                        },
                        children: [
                            Comments({isRed: self.state.isRed, comments: self.state.comments}),
                            Button({onClick: self.updateCommentColor})
                        ]
                    }
                ]
            };
        }
    }
})(FakeReact, Comments, Button);

var ContentEditable = (function() {
    return function(props) {
        return {
            type: 'div',
            props: {
                className: 'ContentEditable',
                contenteditable: true
            },
            children: [
                {
                    type: 'strong',
                    props: {},
                    children: [
                        'Inline editing in action!'
                    ]
                },
                {
                    type: 'p',
                    props: {},
                    children: [
                        "The 'div' element that contains this text is now editable"
                    ]
                }
            ]
        }
    }
})();

var OfficeActionEditor = (function(ckEditor, ContentEditable) {
    return function() {
        var self = this;

        self.onRender = function() {
            console.log("From OAEditor!");
            ckEditor.disableAutoInline = true;
            ckEditor.inline('ContentEditable');
        };

        self.render = function(){
            return {
                type: 'div',
                props: {
                    className: 'OfficeActionEditor row'
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            className: 'col'
                        },
                        children: [
                            ContentEditable()
                        ]
                    }
                ]
            }
        };
    }
})(CKEDITOR, ContentEditable);

var App = (function(react, CommentsBox, OfficeActionEditor) {
    return function() {
        var self = this;

        self.onInit = function(){};

        self.onRender = function() {
            console.log("From App!");
        };

        self.render = function() {
            var commentsBox = new CommentsBox();
            var editor = new OfficeActionEditor();
            commentsBox.onInit();
            return {
                type: 'div',
                props: {
                    className: 'App' + ' container'
                },
                children: [
                    commentsBox,
                    editor
                ]
            }
        }
    };
})(FakeReact, CommentsBox, OfficeActionEditor);

FakeReact.mount(App);