@echo off
rem Starts the garden locally and opens the demo page (works on a fresh database).
rem On this PC's own database, add ?subscriber=forest_test_reader to see a forest with 5 trees.
rem Keep this window open while you look at the page; close it to stop the server.
cd /d "%~dp0"
start "" "http://localhost:3001/"
npm start
