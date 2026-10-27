; Build on Windows with Inno Setup 6, after packaging/build.py freezes the app.
[Setup]
AppId={{75E1F526-17EE-46D1-A76F-B49889A80145}
AppName=KINOSOTA Player
AppVersion=0.1.2
DefaultDirName={localappdata}\Programs\KINOSOTA Player
DefaultGroupName=KINOSOTA Player
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=KINOSOTA-Player-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\kinosota-player.exe
WizardStyle=modern
CloseApplications=yes
[Files]
Source: "..\dist\kinosota-player\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\KINOSOTA Player"; Filename: "{app}\kinosota-player.exe"
Name: "{autodesktop}\KINOSOTA Player"; Filename: "{app}\kinosota-player.exe"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
[Run]
Filename: "{app}\kinosota-player.exe"; Description: "Launch KINOSOTA Player"; Flags: nowait postinstall skipifsilent
