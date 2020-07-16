const gulp = require("gulp")
const del = require("del")
const rename = require("gulp-rename")
const fs = require("fs");

const sass = require("gulp-sass")
sass.compiler = require("sass");

const csso = require("gulp-csso")

const markdown = require("gulp-markdownit")

const handlebars = require("gulp-hb");
const inline = require('gulp-inline-source')

const config = require("./config.json")

const src = {
    handlebars: {
        partials: `${config.root}/assets/partials/**/*.hbs`,
        template: `${config.root}/assets/template.hbs`,
    }
}

// Gulp pipeline options

const options = {
    sass: {
        includePaths: ["node_modules"]
    },
    markdown: {
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
}

/* Tasks */

function resolve(root, path) {
    if (path) {
        return root ? `${root}/${path}` : path
    }
    return root
}

function exists(path) {
    return fs.existsSync(path)
}

function read(path) {
    if (exists(path)) {
        return fs.readFileSync(path).toString()
    }
    return undefined;
}

// Helper

function public(name, task) {
    gulp.task(name, task); // Note that this is deprecated, however, the actual usage below does not work
    //exports[name] = task;
    return task;
}

function private(name, task) {
    task.displayName = name;
    return task;
}

function copy(src, dest, alt) {
    return private(
        "copy:" + (alt === undefined ? ` "${src}" to "${dest}"` : alt),
        () => gulp.src(src).pipe(gulp.dest(dest))
    );
}

function clean(src, alt) {
    return private(
        "clean:" + (alt === undefined ? ` "${src}"` : alt),
        () => del(src, { force: true })
    );
}

// Category

function createCategory(root, parent, category) {
    const src = resolve(root.src, category.path || category.name);
    const out = resolve(root.out, category.name);

    const paths = {
        src: resolve(src, config.category),
        out: out
    }

    const data = {
        logo: exists(resolve(src, "src/assets/images/logo.svg")) ? resolve(out, "assets/images/logo.svg") : parent.logo,
        styles: exists(resolve(src, "src/assets/css/index.scss")) ? parent.styles.concat([resolve(out, "assets/css/index.css")]) : parent.styles,
    }

    const categories = category.categories ? category.categories.map(c => createCategory(paths, data, c)) : undefined
    const articles = category.files ? category.files.map(a => createArticle({ src: src, out: out }, a)) : undefined;

    return {
        name: category.name || "root",
        path: out || "root",
        src: {
            css: resolve(src, "src/assets/css/*.scss"),
            images: resolve(src, "src/assets/images/**")
        },
        out: {
            css: resolve(config.out, resolve(out, "assets/css")),
            images: resolve(config.out, resolve(out, "assets/images"))
        },
        articles: articles,
        categories: categories,
        data: {
            logo: data.logo,
            styles: data.styles,
            path: out,
            articles: articles ? articles.map(article => article.data) : undefined
        }
    }
}

function createArticle(root, article) {
    return {
        name: article.name,
        src: resolve(root.src, `src/${article.name}.md`),
        out: resolve(config.out, root.out),
        data: {
            title: article.title,
            wip: article.wip
        }
    }
}

// Misc

function copyImages(category) {
    return private(
        `copy:img:${category.path}`,
        copy(category.src.images, category.out.images)
    );
}

function compileCSS(category) {
    return private(
        `compile:css:${category.path}`,
        () => {
            return gulp.src(category.src.css)
                .pipe(sass(options.sass))
                .pipe(csso())
                .pipe(gulp.dest(category.out.css))
        }
    );
}

// Markdown to HTML

function compileMarkdown(category, article) {
    return private(
        `compile:html:${category.path}:${article.name}`,
        () => {
            return gulp.src(article.src)
                .pipe(markdown(options.markdown))
                .pipe(gulp.dest(`${article.out}/raw`))
        }
    )
}

function injectHTML(category, article) {
    return private(
        `build:html:${category.path}:${article.name}`,
        () => {
            const engine = handlebars()
                .partials(src.handlebars.partials)
                .data({
                    category: category.data,
                    article: article.data,
                    server: config.server,
                    content: read(`${article.out}/raw/${article.name}.html`),
                })

            const template = gulp.src(src.handlebars.template)
                .pipe(engine) //
                .pipe(rename(`${article.name}.html`))
                .pipe(gulp.dest(article.out))

            if (config.standalone) {
                return template
                    .pipe(inline({
                        attribute: false,
                        rootpath: config.out,
                        saveRemote: false,
                        svgAsImage: true,
                    }))
                    .pipe(gulp.dest(`${article.out}/standalone`))
            }

            return template;
        }
    )
}

function buildMarkdown(category, article) {
    return gulp.series(
        compileMarkdown(category, article),
        injectHTML(category, article)
    )
}

function flattenTasks(category) {
    const tasks = [
        gulp.parallel(
            copyImages(category),
            compileCSS(category)
        )
    ]

    if (category.articles) {
        tasks.push(gulp.parallel(
            category.articles.map(article => buildMarkdown(category, article))
        ))
    }

    if (category.categories) {
        tasks.push(gulp.parallel(
            category.categories.map(child => public(`build:${child.path}`, flattenTasks(child)))
        ))
    }
    return gulp.series(tasks)
}

// Global

public("clean", clean(config.out));

public("build", flattenTasks(createCategory({}, {
    styles: []
}, config)));

public("install", gulp.series("clean", "build"));