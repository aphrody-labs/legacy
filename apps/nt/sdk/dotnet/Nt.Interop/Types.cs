// Blittable interop types (no bool/char: identical sequential layout on the native and managed sides).
// Enumeration values = those of System.IO.DriveType and System.Runtime.InteropServices.Architecture,
// read from the Microsoft.NETCore.App 11.0.0 metadata by sdk/tools/dotnet-ffi/ecma335.ts (2026-11-12).
using Nt.Interop.Ffi;

namespace Nt.Interop;

public enum NtPlatform
{
    Unknown = 0,
    Windows = 1,
    Linux = 2,
    MacOS = 3,
    FreeBsd = 4,
}

public enum NtArchitecture
{
    X86 = 0,
    X64 = 1,
    Arm = 2,
    Arm64 = 3,
    Wasm = 4,
    S390x = 5,
    LoongArch64 = 6,
    Armv6 = 7,
    Ppc64le = 8,
    RiscV64 = 9,
}

public enum NtDriveKind
{
    Unknown = 0,
    NoRootDirectory = 1,
    Removable = 2,
    Fixed = 3,
    Network = 4,
    CDRom = 5,
    Ram = 6,
}

/// <summary>Host system facts, filled by <c>nt_system_info</c> (88 bytes, alignment 8).</summary>
[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public unsafe struct NtSystemInfo
{
    public int Major;
    public int Minor;
    public int Build;
    /// <summary>Windows: registry UBR; otherwise Environment.OSVersion.Version.Revision.</summary>
    public int Revision;
    public NtPlatform Platform;
    public NtArchitecture Architecture;
    public int ProcessorCount;
    public int PageSize;
    /// <summary>1 if the code runs under NativeAOT (no dynamic code), 0 under CoreCLR.</summary>
    public byte IsAot;
    public byte Is64Bit;
    public long TotalMemory;
    public long TickCount;
    /// <summary>Windows: registry DisplayVersion (e.g. 25H2).</summary>
    [Utf16]
    public fixed ushort DisplayVersion[16];
}
