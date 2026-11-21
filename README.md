
# MentorLagbe – Backend

MentorLagbe is a full-stack tuition and mentorship platform that connects students with tutors. This repository contains the REST API built with Node.js, Express, TypeScript, and MongoDB.

## Features

- Better Auth authentication with JWT authorization.
- Role-based access for Students, Tutors, and Admins.
- Tuition creation and management.
- Admin tuition approval and rejection.
- Student tuition applications.
- Tutor application management.
- Free and Pro subscription plans.
- Stripe Checkout and payment verification.
- Stripe webhook integration.
- ImgBB image uploads.
- Admin user and transaction management.
- MongoDB database integration.

## Technologies Used

- Node.js
- Express.js
- TypeScript
- MongoDB
- Better Auth
- Stripe
- ImgBB
- JSON Web Tokens

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB database
- Stripe account and Stripe CLI for local webhook testing
- ImgBB API key

### Installation

Clone the repository:

```bash
git clone YOUR_SERVER_REPOSITORY_URL
```

Navigate to the project directory:

```bash
cd mentorlagbe-server
```

Install dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root and configure the following variables:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
DB_NAME=your_database_name

BETTER_AUTH_SECRET=your_better_auth_secret
BETTER_AUTH_URL=http://localhost:5000
CLIENT_URL=http://localhost:3000

STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

IMGBB_API_KEY=your_imgbb_api_key
```

Use the actual variable names from your project if they differ. Never commit real secrets or API keys.

### Run the Development Server

```bash
npm run dev
```

### Build the Project

```bash
npm run build
```

### Run the Production Build

```bash
npm start
```

## API Overview

| Module | Main Functionality |
|---|---|
| Authentication | User authentication and authorization |
| Users | Profiles, roles, and admin user management |
| Tuitions | Tuition creation, browsing, editing, and moderation |
| Applications | Student applications and tutor decisions |
| Payments | Stripe checkout, verification, and transactions |
| Uploads | Image uploads through ImgBB |

## Database Collections

The application uses four MongoDB collections:

1. `users`
2. `tuitions`
3. `applications`
4. `payments`

## User Roles

- **Student:** Browse tuitions, apply, and manage applications.
- **Tutor:** Post tuitions and manage student applications.
- **Admin:** Manage users, approve or reject tuitions, and monitor transactions.

## Payment Plans

- Student Pro: $10
- Tutor Pro: $15

Successful payments are verified before updating a user's subscription plan and recording the transaction.

## Frontend

The frontend is maintained in a separate repository and built with Next.js.

## Security

- Protected API routes use JWT authentication.
- Role-based middleware restricts privileged operations.
- Payment records are created only after successful payment verification.
- Environment secrets must remain private.
