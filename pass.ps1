$controlPassword = Read-Host 'Mat khau tai khoan local (12-256 ky tu)' -AsSecureString
$controlPasswordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($controlPassword)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($controlPasswordPtr) |
    node .\remote-control.js user admin@gmail.com
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($controlPasswordPtr)
  Remove-Variable controlPassword, controlPasswordPtr
}