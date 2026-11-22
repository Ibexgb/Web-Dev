# Oakline Renovations — Project Case Study

## Project Overview

Oakline Renovations is a fictional, localhost-only staff project management application developed as a full-stack website development training project. It demonstrates how a web interface, backend API, authentication system, and persistent database work together.

The application is intended for training and portfolio review, not public deployment or use with real customer information.

## The Challenge

Build a small staff application that supports different permission levels while keeping project records persistent and protecting restricted operations.

## The Solution

The application provides two staff roles:

- **Viewer:** Can sign in and view sample project records.
- **Editor:** Can sign in, create sample projects, mark them reviewed, and delete them.

The implementation includes an accessible web interface, Node.js backend, SQL.js database persistence, server-side sessions, role-based permissions, and CSRF protection.

## Development and Testing

The project includes automated backend tests and application smoke checks. GitHub Actions runs `npm ci` and `npm run verify` on pushes and pull requests.

Manual testing covered the login experience, viewer and editor permissions, project management operations, browser refresh behavior, and responsive layout.

## Skills Demonstrated

- Frontend development with HTML, CSS, and JavaScript
- Backend development using Node.js
- Database persistence and SQL queries
- Authentication and authorization
- Accessibility and responsive design
- Automated testing and continuous integration
- Git version control and technical documentation

## Project Limitations

Oakline runs over plain HTTP on `127.0.0.1` and uses fictional demonstration accounts and records. It must not be exposed publicly or used to store real credentials or customer information.

## Lessons Learned

This project provided practical experience integrating frontend, backend, database, and security features into a working application. It also demonstrated the value of testing changes, reviewing accessibility, and using GitHub Actions to verify updates consistently.
