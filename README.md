# RENDA

RENDA is a high-fidelity media identification, enrichment, and physical organization pipeline designed for large-scale video libraries. It automates the process of scanning raw media files, matching them against online databases, and reorganizing them into a standardized filesystem structure.

## Core Features

- Automated Scanning: Recursive discovery of video files and associated extras (subtitles, images, NFOs).
- Metadata Enrichment: Integration with TMDB API for multi-language metadata, posters, and person profiles.
- Intelligent Formatting: Customizable naming templates for movies, series, seasons, and episodes using advanced parsing (GuessIt).
- Extra File Handling: Automatic linkage and renaming of supplementary files based on the primary media item.
- Hardware Accelerated Probing: Fast FFprobe integration for technical media analysis (codecs, bitrates, resolution).
- Robust Database Tracking: Highly indexed, ACID-compliant SQLite database with SQLAlchemy ORM for managing file states, matches, and configurations.
- Safe Operations: Integration with Send2Trash for safe file deletion during reorganization.
- Modular Architecture: Cleanly separated backend logic (FastAPI) and modern, scalable frontend UI (React inside Electron).

## Technical Stack

### Backend
- Language: Python 3.10+
- Framework: FastAPI (with Uvicorn)
- Database: SQLite via SQLAlchemy ORM
- Parsing & Image Processing: GuessIt, Pillow
- Metadata: TMDB API (via Requests)
- Probing: FFmpeg / FFprobe
- Utils: python-dotenv, colorama, Send2Trash

### Frontend
- Framework: React 18+ (Vite)
- State Management: React Context API
- Styling: Custom CSS with modern UI/UX principles
- Platform: Electron (for native filesystem access and IPC)

## Architecture Overview

The application is strictly divided into modular domains:

### Backend (app/)
- api/routes: Modular FastAPI endpoints for scanner, media management, metadata, and settings.
- db/models: Segmented SQLAlchemy models (media, metadata, action logs, persons).
- scanner: Directory traversal, metadata parsing, and API enrichment logic.
- formatter: Formatting engine for determining planned paths for movies and TV series.

### Frontend (frontend/src/)
- components/: Modular React components grouped by feature (Discovery, Navigation, Modals).
- context/: Centralized state management via AppContext.
- locales/: i18n localization support.

## Prerequisites

Before running the application, ensure you have the following installed:
- Node.js (version 18 or higher)
- Python 3.10 or higher
- FFmpeg and FFprobe (must be added to the system PATH)

## Installation and Execution

1. Clone the repository.
2. Install the backend Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
4. Install the frontend Node.js dependencies:
   ```bash
   npm install
   ```
5. Run the development server (this concurrently launches the Python backend, Vite bundler, and Electron application):
   ```bash
   npm run dev
   ```

