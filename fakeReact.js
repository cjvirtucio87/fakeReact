var FakeReact = (function() {
    /*
        Dollar sign implies a real dom node.
        No dollar sign implies a VDOM node.

        A VDOM node implements matches the ff schema:
        {
            type: the DOM element to be created (e.g. 'p' for a <p> tag),
            props: the attributes to be set on the DOM element (e.g. className for the class attribute; onClick for the click handler),
            children: an array of the child nodes
        }
    */
    var stub = {};

    stub.onMountHooks = [];

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
        Object.keys(props).reduce(function($target,key) {
            if (isEventProp(key)) $target.addEventListener(
                extractEventName(key),
                props[key]
            );
            return $target;
        }, $target);
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
        (1) one node is a string, the other a VDOM node (perhaps a string was replaced with a VDOM node, or vice-versa)
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
            // unorphaned textNodes must be converted to spans for tracking and manipulation
            var $span = document.createElement('span');
            $span.appendChild(document.createTextNode(node));
            return $span;
        }

        // we know it's a class member if it has a render function
        if (node.render) {
            if (node.onMount) stub.onMountHooks.push(node.onMount);
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
        Ignore trees that are marked for ignore.
    */
    stub.updateElement = function($parent, newNode, oldNode, index = 0) {
        if ($parent && $parent.ignore) return;
        if (!oldNode) {
            $newNode = stub.createElement(newNode);
            setProps($newNode, newNode.props);
            $parent.appendChild($newNode);
        } else if (!newNode) {
            $parent.removeChild($parent.childNodes[index]);
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
                    oldNode.children[i],
                    i
                );
            }
        }
    };

    /*
        (1) Capture the old VDOM node.
        (2) Update state.
        (3) Retrieve the updated VDOM node.
        (4) Call updateElement.

        Be sure to pass the index of the newNode in the $parent's children array.
        This represents the position of the newNode relative to the siblings.
    */
    function render(prevState, nextState, rootComponent, id, index) {
        var oldNode = rootComponent.render();
        rootComponent.state = Object.assign(prevState, nextState);
        var newNode = rootComponent.render();
        stub.updateElement(
            document.getElementById(id).parentNode,
            newNode,
            oldNode,
            index
        );
    }

    /*
        setState must be called with the component's 'this' to bind it the function and manipulate its state.
    */
    stub.setState = function(nextState, id, index) {
        var componentSelf = this;
        var prevState = componentSelf.state;
        render(prevState, nextState, componentSelf, id, index);
    };

    stub.mount = function(rootComponent) {
        var rootComponentInstance = new rootComponent();
        rootComponentInstance.onInit();
        var $root = document.getElementById('root');
        $root.appendChild(stub.createElement(rootComponentInstance.render()));
        // onMountHooks are executed once we append the tree to the $root
        stub.onMountHooks.forEach(function(hook) { hook() });
    }

    return stub;
})();

var constants = {
    BASE_URI: 'https://jsonplaceholder.typicode.com'
};

var Client = (function(ajax){
    var stub = {};

    stub.get = function(url, payload, headers) {
        return ajax({
            url: url,
            data: payload,
            headers: headers,
            method: 'GET'
        });
    }

    return stub;
})($.ajax);

function Button(label) {
    return function(props = {}) {
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
                                label
                            ]
                        }
                    ]
                }
            ]
        };
    }
}

var RedButton = Button('Red');
var NewCommentButton = Button('Add Comment');
var RemoveCommentButton = Button('Remove Comment');
var SendOAButton = Button('Send');
var InsertOAButton = Button('Insert');

function Post(props = {}) {
    var post = props.post
    var index = props.index;
    return {
        type: 'div',
        props: {
            className: 'Post',
            index: index
        },
        children: [
            {
                type: 'p',
                props: {},
                children: [
                    '[TITLE] ' + post.title
                ]
            },
            {
                type: 'p',
                props: {},
                children: [
                    '[BODY] ' + post.body
                ]
            }
        ]
    }
}

function Posts(props = {}) {
    var posts = props.posts;
    debugger;
    return {
        type: 'div',
        props: {
            className: 'Posts',
        },
        children: posts.slice(0,5).map(function(post, i) {
            return Post({post: post, index: i});
        })
    }
}

function Comment(props = {}) {
    var comment = props.comment || {};
    var output = {
        type: 'li',
        props: {
            className: 'Comment' + props.isRedClass,
            index: props.index
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
                        children: props.comments.map(function(comment, i) {
                            return Comment({isRedClass: isRedClass, comment: comment, index: i});
                        })
                    }
                ]
            }
        ]
    };
}

var CommentsBox = (function(react, Comments, RedButton, NewCommentButton, RemoveCommentButton) {
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

        self.onMount = function() {
            console.log("From CommentsBox!");
        };

        self.updateCommentColor = function(ev) {
            ev.preventDefault();
            react.setState.call(self, { isRed: !self.state.isRed }, 'CommentsBox', 1);
        }

        self.addComment = function(ev) {
            ev.preventDefault();
            var oldComments = self.state.comments;
            var newComments = Object.assign([], oldComments);
            newComments.push({ title: 'another comment', body: 'another one'});
            react.setState.call(self, { comments: newComments }, 'CommentsBox', 1);
        }

        self.removeComment = function(ev) {
            ev.preventDefault();
            var oldComments = self.state.comments;
            var newComments = Object.assign([], oldComments);
            newComments.pop();
            react.setState.call(self, { comments: newComments }, 'CommentsBox', 1);
        }

        self.render = function() {
            return {
                type: 'div',
                props: {
                    className: 'CommentsBox row'
                }, 
                children: [
                    {
                        type: 'div',
                        props: {
                            className: 'col'
                        },
                        children: [
                            Comments({isRed: self.state.isRed, comments: self.state.comments}),
                            RedButton({onClick: self.updateCommentColor}),
                            NewCommentButton({onClick: self.addComment}),
                            RemoveCommentButton({onClick: self.removeComment})
                        ]
                    }
                ]
            };
        }
    }
})(FakeReact, Comments, RedButton, NewCommentButton, RemoveCommentButton);

var ContentEditable = (function() {
    return function(props) {
        return {
            type: 'div',
            props: {
                className: 'ContentEditable',
                contenteditable: true,
                ignore: true
            },
            children: [
                {
                    type: 'strong',
                    props: {},
                    children: [
                        'Welcome to the Office Action Editor!'
                    ]
                },
                {
                    type: 'p',
                    props: {},
                    children: [
                        "The 'div' element that contains this text is now editable",
                    ]
                },
                {
                    type: 'p',
                    props: {},
                    children: [
                        "Start typing!",
                    ]
                },
                {
                    type: 'p',
                    props: {},
                    children: [
                        "Click the 'send' button to view the raw html in the editor.",
                    ]
                },
                {
                    type: 'p',
                    props: {},
                    children: [
                        "Click the 'insert' button to insert raw html at the cursor's position.",
                    ]
                }
            ]
        }
    }
})();

var OfficeActionEditor = (function(react, constants, client, ckEditor, ContentEditable, SendOAButton, InsertOAButton, Posts) {
    return function(props) {
        var self = this;

        self.state = {
            editorInstance: {},
            posts: []
        };

        self.onMount = function() {
            console.log("From OAEditor!");
            ckEditor.disableAutoInline = true;
            ckEditor.inline('ContentEditable');
            self.state.editorInstance = ckEditor.instances['ContentEditable'];
            self.fetchData();
        };

        self.fetchData = function() {
            client.get(constants.BASE_URI + '/posts')
                .then(function(res) {
                    var oldPosts = [];
                    var newPosts = oldPosts.concat(res);
                    react.setState.call(self, { posts: newPosts }, 'OfficeActionEditor', 0);
                })
                .catch(function(err) {
                    console.log(err);
                });
        }

        self.getOAHtml = function(ev) {
            var instance = self.state.editorInstance;
            var data = instance.getData();
            console.log(data);
            return data;
        };

        self.insertOAHtml = function() {
            var instance = self.state.editorInstance;
            instance.insertHtml('<p>Hello, world!</p>');
        }

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
                            {
                                type: 'strong',
                                props:{},
                                children: [
                                    'OA BUTTONS'
                                ]
                            },
                            SendOAButton({onClick: self.getOAHtml}),
                            InsertOAButton({onClick: self.insertOAHtml}),
                            {
                                type: 'strong',
                                props:{},
                                children: [
                                    'OFFICE ACTION EDITOR'
                                ]
                            },
                            ContentEditable(),
                            {
                                type: 'strong',
                                props:{},
                                children: [
                                    'POSTS'
                                ]
                            },
                            Posts({posts: self.state.posts})
                        ]
                    }
                ]
            }
        };
    }
})(FakeReact, constants, Client, CKEDITOR, ContentEditable, SendOAButton, InsertOAButton, Posts);

var App = (function(react, CommentsBox, OfficeActionEditor) {
    return function() {
        var self = this;

        self.onInit = function(){};

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
                    editor,
                    commentsBox
                ]
            }
        }
    };
})(FakeReact, CommentsBox, OfficeActionEditor);

FakeReact.mount(App);