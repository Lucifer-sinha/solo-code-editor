// index.js
const React = require('react');
const ReactDOMServer = require('react-dom/server');

function App() {
    return React.createElement('div', null, 'Hello from Node without JSX!');
}

const html = ReactDOMServer.renderToString(React.createElement(App));

console.log(html);
