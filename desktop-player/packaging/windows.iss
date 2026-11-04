; Build on Windows with Inno Setup 6, after packaging/build.py freezes the app.
[Setup]
AppId={{75E1F526-17EE-46D1-A76F-B49889A80145}
AppName=KINOSOTA Player
AppVersion=0.1.7
AppPublisher=KINOSOTA
AppPublisherURL=https://watch.scenrix.com
AppSupportURL=https://watch.scenrix.com/player
AppUpdatesURL=https://watch.scenrix.com/player
VersionInfoCompany=KINOSOTA
SetupIconFile=..\build\icons\kinosota.ico
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
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
[Files]
Source: "..\dist\kinosota-player\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\KINOSOTA Player"; Filename: "{app}\kinosota-player.exe"
Name: "{autodesktop}\KINOSOTA Player"; Filename: "{app}\kinosota-player.exe"; Tasks: desktopicon
; kinosota://watch?launch=<uuid> from the website «▶ Смотреть» button (per-user, no admin rights).
[Registry]
Root: HKCU; Subkey: "Software\Classes\kinosota"; ValueType: string; ValueName: ""; ValueData: "URL:KINOSOTA Player"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\kinosota"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\kinosota\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\kinosota-player.exe,0"
Root: HKCU; Subkey: "Software\Classes\kinosota\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\kinosota-player.exe"" ""%1"""
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
[Run]
Filename: "{app}\kinosota-player.exe"; Description: "Launch KINOSOTA Player"; Flags: nowait postinstall skipifsilent
