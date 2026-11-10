param([string]$InitialDirectory)
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$dialog.Title = 'Local Workflow Studio - Upload file'
if ($InitialDirectory -and [System.IO.Directory]::Exists($InitialDirectory)) {
  $dialog.InitialDirectory = $InitialDirectory
}
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
try {
  $owner.Show()
  $owner.Activate()
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::WriteLine($dialog.FileName)
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
