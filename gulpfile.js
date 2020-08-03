const gulp = require("gulp")
const del = require("del")
const rename = require("gulp-rename")
const fs = require("fs");

const sass = require("gulp-sass")
sass.compiler = require("sass");

const csso = require("gulp-csso");

const layout = require("./config/layout.json");

// Gulp pipeline options

const options = {
    sass: {
        includePaths: ["node_modules"]
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
    const stub = {
        src: resolve(root.src, category.name),
        out: resolve(root.out, category.name),
        path: resolve(root.path, category.name),
        options: {
            ...parent.options,
            ...category.options
        }
    }

    const url = resolve(parent.url, category.name);
    const data = {
        logo: exists(`${stub.src}/assets/images/logo.svg`) ? `${url}/assets/images/logo.svg` : parent.logo,
        styles: exists(`${stub.src}/assets/css/index.sass`) ? parent.styles.concat([`${url}/assets/css/index.css`]) : parent.styles,
        templates: {
            partials: parent.templates.partials.concat([`${stub.src}/assets/templates/partials/**/*.hbs`]),
            layout: exists(`${stub.src}/assets/templates/layout.hbs`) ? `${stub.src}/assets/templates/layout.hbs` : parent.templates.layout,
        },
        url: url
    };

    const categories = category.categories ? category.categories.map(child => createChild(stub, data, child)) : undefined;
    const articles = category.files ? category.files.map(a => createArticle(stub, data, a)) : undefined;

    return {
        name: category.name || "root",
        path: stub.path || "root",
        options: stub.options,
        src: {
            css: `${stub.src}/assets/css/*.sass`,
            images: `${stub.src}/assets/images/**`,
            partials: data.templates.partials
        },
        out: {
            css: `${stub.out}/assets/css`,
            images: `${stub.out}/assets/images`
        },
        categories: categories,
        articles: articles,
        data: {
            title: category.title,
            name: category.name,
            description: category.description,
            path: data.url,

            logo: data.logo,
            styles: data.styles,

            categories: categories
                ? categories
                    .map(category => category.data)
                : undefined,
            articles: articles
                ? articles
                    .filter(article => !article.data.root)
                    .map(article => article.data)
                : undefined
        }
    };
}

function createChild(root, data, category) {
    return createCategory(root, data, category.path ? {
        name: category.path,
        ...JSON.parse(read(`${root.src}/${category.path}/config.json`))
    } : category)
}

function createArticle(root, parent, article) {
    return {
        name: article.name,
        src: resolve(root.src, `${article.name}.md`),
        out: root.out,
        template: parent.templates.layout,
        data: {
            root: article.name === "index",

            name: article.name,
            title: article.title,
            description: article.description,
            path: `${parent.url}/${article.name}.html`,

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

const markdown = initMarkdown();

function initMarkdown() {
    const mardown = require("markdown-it")
    const options = require("./config/markdown")
    const md = mardown(options.preset || 'default', options.options);
    for (const plugin of options.plugins) {
        md.use(require(plugin.name), plugin.options)
    }
    return md;
}


const handlebars = require("handlebars");
const hb = require("handlebars-wax");
const through = require("through2");

function compile(compiler, article) {
    return through.obj((file, enc, cb) => {
        // Is it necessary to handle file.isNull() and file.isStream()?
        try {
            const html = compiler.compile(read(article.template));
            const template = compiler.compile(file.contents.toString());

            const context = {
                file: file.data,
                article: article.data
            }

            // Compile raw markdown into file
            const contents = Buffer.from(markdown.render(template(context, {
                data: {
                    server: layout.server
                }
            })));

            // Compile html template into file
            file.contents = Buffer.from(html(context, {
                data: {
                    file: {
                        contents: contents
                    },
                    server: layout.server
                }
            }))

            cb(null, file)
        } catch (err) {
            cb(err)
        }
    });
}

function compileMarkdown(compiler, category, article) {
    return private(
        `compile:html:${category.path}:${article.name}`,
        () => {
            return gulp.src(article.src)
                .pipe(compile(compiler, article))
                .pipe(rename(`${article.name}.html`))
                .pipe(gulp.dest(article.out));
        }
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
        const wax = hb(handlebars)
            .partials(category.src.partials)
            .data({
                category: category.data
            })

        tasks.push(gulp.parallel(
            category.articles.map(article => compileMarkdown(wax, category, article))
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

public("clean", clean(layout.out));

const boot = createCategory({
    src: `./${layout.root}`,
    out: `./${layout.out}`,
    path: ""
}, {
    styles: [],
    templates: {
        partials: []
    },
    url: layout.server.path
}, require(`./${layout.root}/config.json`));

public("build", flattenTasks(boot));

public("install", gulp.series("clean", "build"));
