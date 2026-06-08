// Loads environment variables from .env BEFORE any other app module is imported.
//
// This module must be the very first import in the entry point. ES module
// imports execute in source order, and several modules (e.g. config/database.ts)
// read process.env at import time — so dotenv has to run before them, not after.
import dotenv from 'dotenv';

dotenv.config();
