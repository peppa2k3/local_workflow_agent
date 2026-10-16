# Upload file picker

Request: choose a local upload file through a folder browsing dialog in addition to typing its path.

Expected: dashboard buttons open a Windows file picker for both saved upload steps and the current run. Selection fills the corresponding path; cancellation keeps it intact. Existing path input and JSON behavior continue.

Evidence: dashboard had text fields only; agent already validates paths before upload.

Status: complete. npm test, node --check, and dashboard syntax check passed.

