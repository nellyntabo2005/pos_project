# POS System

A modern Point of Sale (POS) system built with React, TypeScript, and Tailwind CSS.

## Features

- **Dashboard** - Analytics overview with KPI cards and charts
- **Point of Sale** - Fast checkout interface
- **Invoice Management** - Create and track invoices
- **Customer Management** - Manage customer data and loyalty
- **Product Management** - Product catalog with categories
- **Purchase Orders** - Track supplier purchases
- **Supplier Management** - Manage supplier relationships
- **Inventory Tracking** - Monitor stock levels
- **Expense Tracking** - Record and categorize expenses
- **Reports** - Sales and financial reports
- **User Management** - Multi-user support with roles
- **Settings** - System configuration
- **Authentication** - Secure login system

## Tech Stack

- **React 18.3.1** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS 4.1** - Styling
- **Vite** - Build tool
- **Radix UI** - Accessible UI components
- **Lucide React** - Icons
- **Recharts** - Data visualization
- **Motion** - Animations

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd code
```

2. Install dependencies:
```bash
pnpm install
```

3. Run the development server:
```bash
pnpm run dev
```

4. Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`)

## Project Structure

```
src/
├── app/
│   ├── App.tsx                 # Main application component
│   ├── components/
│   │   ├── auth/              # Authentication components
│   │   ├── pages/             # Page components
│   │   ├── ui/                # Reusable UI components
│   │   └── utils/             # Utility functions
│   └── styles/                # Global styles and theme
├── package.json
└── vite.config.ts
```

## Default Login

The system starts with authentication enabled. Set `isAuthenticated` to `true` in `App.tsx` to bypass login during development.

## Building for Production

```bash
pnpm run build
```

The build output will be in the `dist/` directory.

## License

MIT
