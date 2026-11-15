// C exports of Nt.Interop (.NET 11) for bun:ffi, without node-api-dotnet.
// DisableRuntimeMarshalling: no implicit conversion (Learn "Disabled runtime marshalling"); .NET 11 NativeAOT terminates the
// process on a non-blittable UnmanagedCallersOnly signature (Learn "Native code interop with Native AOT").
// No exception crosses the boundary: negative codes (-1 invalid argument, -2 exception).
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using Microsoft.Win32;
using Nt.Interop.Ffi;

[assembly: DisableRuntimeMarshalling]

namespace Nt.Interop;

public static unsafe class Exports
{
    /// <summary>Empty call: fixed cost of a bun -> .NET transition.</summary>
    [UnmanagedCallersOnly(EntryPoint = "nt_noop")]
    public static void Noop()
    {
    }

    [UnmanagedCallersOnly(EntryPoint = "nt_add")]
    public static int Add(int a, int b) => a + b;

    /// <summary>Environment.TickCount64 (64-bit return: BigInt on the bun side).</summary>
    [UnmanagedCallersOnly(EntryPoint = "nt_tick_count")]
    public static long TickCount() => Environment.TickCount64;

    [UnmanagedCallersOnly(EntryPoint = "nt_system_info")]
    public static int SystemInfo(NtSystemInfo* result)
    {
        if (result == null)
        {
            return -1;
        }
        try
        {
            *result = default;
            Version v = Environment.OSVersion.Version;
            result->Major = v.Major;
            result->Minor = v.Minor;
            result->Build = Math.Max(v.Build, 0);
            result->Revision = Math.Max(v.Revision, 0);
            result->Platform =
                OperatingSystem.IsWindows() ? NtPlatform.Windows
                : OperatingSystem.IsLinux() ? NtPlatform.Linux
                : OperatingSystem.IsMacOS() ? NtPlatform.MacOS
                : OperatingSystem.IsFreeBSD() ? NtPlatform.FreeBsd
                : NtPlatform.Unknown;
            result->Architecture = (NtArchitecture)(int)RuntimeInformation.ProcessArchitecture;
            result->ProcessorCount = Environment.ProcessorCount;
            result->PageSize = Environment.SystemPageSize;
            result->IsAot = RuntimeFeature.IsDynamicCodeSupported ? (byte)0 : (byte)1;
            result->Is64Bit = Environment.Is64BitProcess ? (byte)1 : (byte)0;
            result->TotalMemory = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
            result->TickCount = Environment.TickCount64;
            if (OperatingSystem.IsWindows())
            {
                ReadWindowsVersion(result);
            }
            return 0;
        }
        catch (Exception)
        {
            return -2;
        }
    }

    [SupportedOSPlatform("windows")]
    private static void ReadWindowsVersion(NtSystemInfo* result)
    {
        const string key = @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion";
        if (Registry.GetValue(key, "UBR", null) is int ubr)
        {
            result->Revision = ubr;
        }
        if (Registry.GetValue(key, "DisplayVersion", null) is string display)
        {
            CopyUtf16(display, (char*)result->DisplayVersion, 16);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "nt_machine_name")]
    public static int MachineName([Utf16Buffer] char* buffer, int capacity)
    {
        try
        {
            return CopyUtf16(Environment.MachineName, buffer, capacity);
        }
        catch (Exception)
        {
            return -2;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "nt_os_description")]
    public static int OsDescription([Utf16Buffer] char* buffer, int capacity) => CopyUtf16(RuntimeInformation.OSDescription, buffer, capacity);

    [UnmanagedCallersOnly(EntryPoint = "nt_framework")]
    public static int Framework([Utf8Buffer] byte* buffer, int capacity) => CopyUtf8(RuntimeInformation.FrameworkDescription, buffer, capacity);

    [UnmanagedCallersOnly(EntryPoint = "nt_runtime_id")]
    public static int RuntimeId([Utf8Buffer] byte* buffer, int capacity) => CopyUtf8(RuntimeInformation.RuntimeIdentifier, buffer, capacity);

    /// <summary>Length in bytes of a UTF-8 string (bun:ffi cstring: transcoded by JavaScriptCore).</summary>
    [UnmanagedCallersOnly(EntryPoint = "nt_utf8_length")]
    public static int Utf8Length([Utf8] byte* text) => text == null ? -1 : MemoryMarshal.CreateReadOnlySpanFromNullTerminated(text).Length;

    /// <summary>Length in UTF-16 units of a UTF-16 string (encoded on the bun side: bun:ffi has no wchar_t type).</summary>
    [UnmanagedCallersOnly(EntryPoint = "nt_utf16_length")]
    public static int Utf16Length([Utf16] char* text) => text == null ? -1 : MemoryMarshal.CreateReadOnlySpanFromNullTerminated(text).Length;

    /// <summary>Aller-retour UTF-16 : copie en majuscules invariantes.</summary>
    [UnmanagedCallersOnly(EntryPoint = "nt_upper")]
    public static int Upper([Utf16] char* text, [Utf16Buffer] char* buffer, int capacity)
    {
        if (text == null)
        {
            return -1;
        }
        ReadOnlySpan<char> s = MemoryMarshal.CreateReadOnlySpanFromNullTerminated(text);
        if (buffer != null && s.Length < capacity)
        {
            _ = s.ToUpperInvariant(new Span<char>(buffer, capacity));
            buffer[s.Length] = '\0';
        }
        return s.Length;
    }

    /// <summary>Callback per drive: visit(name, length, type, total size); 0 stops. Returns the number visited.</summary>
    [UnmanagedCallersOnly(EntryPoint = "nt_drives")]
    public static int Drives(delegate* unmanaged<char*, int, NtDriveKind, long, int> visit)
    {
        if (visit == null)
        {
            return -1;
        }
        try
        {
            int n = 0;
            foreach (DriveInfo d in DriveInfo.GetDrives())
            {
                long size = 0;
                try
                {
                    if (d.IsReady)
                    {
                        size = d.TotalSize;
                    }
                }
                catch (Exception)
                {
                    size = -1;
                }
                string name = d.Name;
                n++;
                fixed (char* p = name)
                {
                    if (visit(p, name.Length, (NtDriveKind)(int)d.DriveType, size) == 0)
                    {
                        break;
                    }
                }
            }
            return n;
        }
        catch (Exception)
        {
            return -2;
        }
    }

    /// <summary>Calls callback(i) for i in [0, count) and sums the returns: cost of a .NET -> bun callback.</summary>
    [UnmanagedCallersOnly(EntryPoint = "nt_sum_callbacks")]
    public static long SumCallbacks(delegate* unmanaged<int, int> callback, int count)
    {
        if (callback == null)
        {
            return -1;
        }
        long sum = 0;
        for (int i = 0; i < count; i++)
        {
            sum += callback(i);
        }
        return sum;
    }

    /// <summary>No EntryPoint: reachable only by the CoreCLR host (hostfxr). 1 under CoreCLR (JIT), 0 under NativeAOT.</summary>
    [UnmanagedCallersOnly]
    public static int DynamicCode() => RuntimeFeature.IsDynamicCodeSupported ? 1 : 0;

    private static int CopyUtf16(ReadOnlySpan<char> value, char* buffer, int capacity)
    {
        if (buffer != null && value.Length < capacity)
        {
            value.CopyTo(new Span<char>(buffer, capacity));
            buffer[value.Length] = '\0';
        }
        return value.Length;
    }

    private static int CopyUtf8(string value, byte* buffer, int capacity)
    {
        int n = Encoding.UTF8.GetByteCount(value);
        if (buffer != null && n < capacity)
        {
            _ = Encoding.UTF8.GetBytes(value, new Span<byte>(buffer, capacity));
            buffer[n] = 0;
        }
        return n;
    }
}
