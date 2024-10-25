# Simple Static Site Generator

This is a simple static site generator built in typescript (Deno). I built it for my needs which are decidedly simple.

## Features

1. Support for HTML and Markdown content.
2. Layout files for all your content. There is a default if you only have one layout.
3. Support for HTML snippets/fragments.
4. Support for assets like images, javascript, css, etc.
5. Hot reload development experience.
6. One executable for build, dev, and deploy.
7. VanJS and AlpineJS built-in for dynamic content.
8. Pico CSS support.

## Requirements

1. Download the sssg release for your platform.
2. The `init` feature will create the `./src` directory and all of its contents for you.
3. Put your HTML (.html) and markdown (.md) pages in the ./src/pages directory. Nested directories are ok.
4. Customize the layout in `./src/layouts/Default.html`. This way you have one layout and all of your pages get wrapped in the same layout. Be sure to have `__CONTENT__` somewhere in your layout file.
5. In the layout file customize the link to your chosen CSS files. We've chosen Pico CSS to include in the scaffold files.
6. Put your static content (images, .js, .css, etc) in the ./src/assets directory and then link to the files like you normally would (/assets/js/whatever.js).
7. The directory structure should look like this.

```
my-site
├── dist          // build will put your built site here, and deploy will deploy from here
└── src           // build is expecting your source files to be here
    └── assets    // the contents of this directory will be copied straight across to ./dist/assets
    │   ├── css
    │   │   ├── pico.colors.min.css
    │   │   ├── pico.min.css
    │   │   └── styles.css
    │   ├── images
    │   │   └── logo.png
    │   └── js
    │       └── app.js
    ├── snippets
    │   └── Test.html
    ├── layouts
    │   ├── alpinejs.html
    │   ├── blog.html
    │   ├── default.html
    │   └── vanjs.html
    └── pages
        ├── about.html
        ├── alpinejs.html
        ├── index.html
        ├── markdown.md
        └── vanjs.html
```

8. You don't have to create `./dist`. The build process will create it for you.

## To Use SSSG

- Download the sssg release for your platform.

- To initialize your project with a minimal project skeleton:
  - Create a project directory `~/code/my-site`.
  - Run `cd ~/code/my-site`.
  - Run `sssg --init` to create the project skeleton in `./src`. This is important because this is where the build expects your source files to be.

- For development run `sssg --dev`. This will:
  - Build the site.
  - Serve the site on port 8080.
  - Watch for file changes in the `./src` directory and then rebuild pages/content as needed.
  - Hot reload the browser after the site rebuilds after a file change.

- To build run `sssg --build`. This will put the rendered content in `./dist`. If you want to you can deploy your site manually from here.

- To deploy:
  - Run `sssg --register --domain=my-domain.com`. This will register my-domain.com to you and will create a staging environment for this site. `my-domain.com` will be associated with deploying to production. We'll make a unique domain for your staging domain. You can inspect .sssg.json to see what's going on there.
  - Run `sssg --deploy --production` or `sssg --deploy --staging`.

## The Future of SSSG
- I'm not sure what else I'll add.
