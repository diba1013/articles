module.exports = {
    options: {
        linkify: true,
        typographer: true,
    },
    plugins: [
        {
            name: "markdown-it-footnote"
        },
        {
            name: "markdown-it-github-headings",
        },
        {
            name: "markdown-it-attrs",
            options: {
                allowedAttributes: ["id", "class", /^data(-\w+)+$/]
            }
        },
        {
            name: "markdown-it-implicit-figures",
            options: {
                figcaption: true
            }
        },
        {
            name: "markdown-it-highlightjs"
        }
    ]
}
