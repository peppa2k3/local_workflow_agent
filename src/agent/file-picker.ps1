param([string]$InitialDirectory)
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
if ($InitialDirectory -and [System.IO.Directory]::Exists($InitialDirectory)) {
  $dialog.InitialDirectory = $InitialDirectory
}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::WriteLine($dialog.FileName)
}
$dialog.Dispose()
