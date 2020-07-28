const markdown = {
    options: {
        linkify: true,
        typographer: true,
    },
    plugins: [
        {
            plugin: require("markdown-it-footnote")
        },
        {
            plugin: require("markdown-it-github-headings"),
        },
        {
            plugin: require("markdown-it-attrs"),
            options: {
                allowedAttributes: ["id", "class", /^data(-\w+)+$/]
            }
        },
        {
            plugin: require("markdown-it-implicit-figures"),
            options: {
                figcaption: true
            }
        },
        {
            plugin: require("markdown-it-highlightjs")
        }
    ]
}

module.exports = markdown;
