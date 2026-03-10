# Litho-SCAN

Litho-SCAN is a Progressive Web App (PWA) that classifies rock types from an image using a deep learning model trained with PyTorch and exported to ONNX for browser integration.
The goal of this project was not to build a production-ready industrial system, but to design and implement a complete end-to-end AI pipeline — from dataset preparation to web application integration.

## MVP

The main objective was to understand and implement the full lifecycle of an AI-powered application:

- Collect and clean a real-world dataset
- Train and evaluate a classification model
- Export the model for deployment
- Integrate it into a web application
- Structure a minimal backend API

This project focuses on learning, structure, and integration rather than performance benchmarking.

## Project Structure

```
lithoscan/
├── frontend/     # PWA (React + TypeScript)
├── backend/      # Minimal Flask API structure
├── ml/           # Dataset preparation, training, ONNX export
├── artifacts/    # Logs, metrics, model outputs
├── docs/         # Technical documentation
└── README.md
```

The separation between ML, frontend, and backend was intentional to keep experimentation, application logic, and infrastructure concerns clearly isolated.

## Machine Learning
### Model

- MobileNetV3-Small (transfer learning)
- Two training phases:
  - Head-only training
  - Backbone fine-tuning
- Early stopping
- Learning rate scheduler
- Evaluation metrics :
  - F1-macro
  - Top-3 accuracy
  - Confusion matrix

### Engineering Work

- Manual dataset cleaning and verification
- Stratified train / validation / test split
- Custom DatasetCSV loader
- Structured logging (CSV / JSON)
- Model checkpoints
- CO₂ tracking using CodeCarbon
- ONNX export script

The goal was not to achieve state-of-the-art accuracy, but to understand the training process, evaluation metrics, and reproducibility aspects of machine learning projects.

## Frontend (Progressive Web App)

Litho-SCAN is implemented as a Progressive Web App using:

- React
- TypeScript
- Vite

The routing structure is organized under a shared layout component (AppLayout) with nested routes.

### Implemented Routes

- **/**                 → LandingPage (home / entry point)
- **/identification**   → PhotoPage (image upload)
- **/confirm**          → ScanMenu (image confirmation & scan entry)
- **/scan**             → ScanPage (AI analysis)
- **/results**          → ResultsPage (prediction display)
- **/exportPdf**        → ExportPage (PDF generation)
- **/IA**               → ModelPage (model information / explanation)

### Technical Aspects

- Nested routing with shared layout (header + footer)
- Strict TypeScript typing
- Guarded navigation to prevent invalid state
- AbortController for cancelling inference
- Separation of concerns (layout / pages / services)
- Clear folder organization

The structure reflects a modular PWA architecture rather than a single-page demo.

## Backend

A minimal backend is implemented using Flask.

Current backend scope:

- Application structure and configuration
- **/health** endpoint
- Basic project setup for future API extension

The backend does not store scan results and does not persist data to a database.

At this stage, it serves mainly to:

- Structure the project as a full-stack application
- Prepare for possible future persistence or API features
- Demonstrate basic backend organization

### Architecture

User
↓
PWA (React + TypeScript)
↓
ONNX model (client-side inference)

The backend is not involved in the inference process.


## What This Project Demonstrates

- Full ML lifecycle understanding
- Frontend modular architecture
- Model export & integration planning
- Clean project organization
- Autonomous cross-domain development

## Limitations

- Small dataset
- No scan persistence
- Not production-optimized
- Educational scope

## Next Steps

Several improvements could be explored in future iterations of the project:

- Model optimization for web inference
- Dataset expansion to improve robustness
- Improved preprocessing pipeline
- User experience improvements
- Optional scan persistence
