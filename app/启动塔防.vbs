' Tower Defense Demo - silent launcher (no console window).
' Double-click this file to play. It just runs: node app\launcher.mjs
' NOTE: keep this file pure ASCII. Windows Script Host parses .vbs as ANSI,
' so non-ASCII characters (e.g. Chinese) become mojibake here.
Option Explicit

Dim shell, fso, baseDir, command, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = baseDir

command = "node """ & baseDir & "\launcher.mjs"""

On Error Resume Next
result = shell.Run(command, 0, False)
If Err.Number <> 0 Then
  MsgBox "Node.js not found." & vbCrLf & vbCrLf & _
         "Please install Node.js 18+ from https://nodejs.org/ " & _
         "and double-click this file again.", 48, "Tower Defense Demo"
End If
On Error GoTo 0
