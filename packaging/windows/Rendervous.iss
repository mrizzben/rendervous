#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{85F20941-11FD-4D8E-9077-1A13FCFBB23C}
AppName=Rendervous
AppVersion={#AppVersion}
AppPublisher=Rendervous
DefaultDirName={localappdata}\Programs\Rendervous
DefaultGroupName=Rendervous
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\..\build\release
OutputBaseFilename=Rendervous-Windows-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\icons\rendervous.ico
UninstallDisplayIcon={app}\Rendervous.exe

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "..\..\build\app\Rendervous\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Rendervous"; Filename: "{app}\Rendervous.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Rendervous"; Filename: "{app}\Rendervous.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Rendervous.exe"; Description: "Launch Rendervous"; Flags: postinstall nowait skipifsilent
