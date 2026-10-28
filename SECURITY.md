# Security Policy

## Supported versions

StockFlow is in active development. Security fixes are made on the `main` branch only.

## Reporting a vulnerability

Please **don't open a public issue** for security problems.

Report them privately through GitHub instead: go to the repository's **Security** tab and choose **Report a vulnerability**. Include the steps to reproduce the problem and what an attacker could do with it.

You can expect a first reply within a few days.

## How the project is protected

- **Dependabot** watches all dependencies and opens pull requests for security updates.
- **Secret scanning with push protection** blocks pushes that contain credentials such as API keys or tokens.
- **CodeQL** scans the JavaScript code for common vulnerabilities on every push and pull request.
- `main` is protected: changes go through pull requests and must pass CI before they are merged.
