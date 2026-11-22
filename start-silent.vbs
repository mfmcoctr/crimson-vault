Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists("d:\04_Projeler\personvault\data") Then
  fso.CreateFolder("d:\04_Projeler\personvault\data")
End If
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "d:\04_Projeler\personvault"
sh.Run "cmd /c ""npm start > data\server.log 2>&1""", 0, False
