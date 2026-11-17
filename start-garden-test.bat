@echo off
rem Starts the garden locally and opens it with the test reader (5 trees in the 3D forest).
rem Keep this window open while you look at the page; close it to stop the server.
cd /d "%~dp0"
start "" "http://localhost:3001/?subscriber=forest_test_reader"
npm start
