# Ankit — Portfolio

A responsive, dependency-free portfolio for Ankit, an independent web designer and developer. Built with semantic HTML, modern CSS and vanilla JavaScript.

## Preview locally

```sh
python3 -m http.server 3000 --bind 0.0.0.0
```

Then open `http://localhost:3000` in the local development environment.

## Deploy

The workflow in `.github/workflows/pages.yml` publishes the static site to GitHub Pages after each push to `main` or `arena/7bdd7c66-portfolio`. The repository's Pages source must be set to **GitHub Actions**.

Production URL: <https://pushparaj9749.github.io/portfolio/>

## Contact form

The enquiry form validates the fields and opens the visitor's email application with a pre-filled message. It does not collect or store form data on a server.
