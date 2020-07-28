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

const layout = require("./config/layout.json")

// Gulp pipeline options

const options = {
    sass: {
        includePaths: ["node_modules"]
    },
    markdown: require("./config/options")
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

function createCategory(root, parent, cat) {
    const category = cat.path ? require(`${root.src}/${cat.path}/config.json`) : cat;

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
            index: exists(`${stub.src}/assets/templates/index.hbs`) ? `${stub.src}/assets/templates/index.hbs` : parent.templates.index,
            layout: exists(`${stub.src}/assets/templates/layout.hbs`) ? `${stub.src}/assets/templates/layout.hbs` : parent.templates.layout,
        },
        url: url
    };

    const categories = category.categories ? category.categories.map(c => createCategory(stub, data, c)) : undefined;
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
            logo: data.logo,
            styles: data.styles,
            path: data.url,
            categories: categories ? categories.map(category => category.data) : undefined,
            articles: articles ? articles.map(article => article.data) : undefined
        }
    };
}

function createArticle(root, parent, article) {
    return {
        name: article.name,
        src: resolve(root.src, `${article.name}.md`),
        out: root.out,
        template: article.name === "index" ? parent.templates.index || parent.templates.layout : parent.templates.layout,
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
                .partials(category.src.partials)
                .data({
                    category: category.data,
                    article: article.data,
                    server: layout.server,
                    content: read(`${article.out}/raw/${article.name}.html`),
                })

            const template = gulp.src(article.template)
                .pipe(engine) //
                .pipe(rename(`${article.name}.html`))
                .pipe(gulp.dest(article.out))

            if (category.options.standalone) {
                return template
                    .pipe(inline({
                        attribute: false,
                        rootpath: layout.out,
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
