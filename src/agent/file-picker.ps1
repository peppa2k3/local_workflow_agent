param([string]$InitialDirectory, [switch]$Folder)
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dialog = if ($Folder) { New-Object System.Windows.Forms.FolderBrowserDialog } else { New-Object System.Windows.Forms.OpenFileDialog }
if ($Folder) {
  $dialog.Description = 'Local Workflow Studio - IDM download folder'
  $dialog.ShowNewFolderButton = $true
} else {
  $dialog.CheckFileExists = $true
  $dialog.Multiselect = $false
  $dialog.Title = 'Local Workflow Studio - Upload file'
}
if ($InitialDirectory -and [System.IO.Directory]::Exists($InitialDirectory)) {
  if ($Folder) { $dialog.SelectedPath = $InitialDirectory } else { $dialog.InitialDirectory = $InitialDirectory }
}
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
try {
  $owner.Show()
  $owner.Activate()
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    if ($Folder) { [Console]::WriteLine($dialog.SelectedPath) } else { [Console]::WriteLine($dialog.FileName) }
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
