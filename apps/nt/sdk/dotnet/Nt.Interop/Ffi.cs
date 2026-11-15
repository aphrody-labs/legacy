// Markers read by sdk/tools/dotnet-ffi/model.ts in the metadata (by simple name); no effect at run time.
namespace Nt.Interop.Ffi;

/// <summary><c>byte*</c> parameter: NUL-terminated UTF-8 string (bun:ffi <c>cstring</c>); field: fixed UTF-8 buffer.</summary>
[AttributeUsage(AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class Utf8Attribute : Attribute
{
}

/// <summary><c>char*</c> parameter: NUL-terminated UTF-16 string; field: fixed UTF-16 buffer.</summary>
[AttributeUsage(AttributeTargets.Parameter | AttributeTargets.Field)]
public sealed class Utf16Attribute : Attribute
{
}

/// <summary>UTF-8 output buffer followed by an <c>int</c> capacity; the method returns the length in bytes (excluding NUL).</summary>
[AttributeUsage(AttributeTargets.Parameter)]
public sealed class Utf8BufferAttribute : Attribute
{
}

/// <summary>UTF-16 output buffer followed by an <c>int</c> capacity; the method returns the length in units (excluding NUL).</summary>
[AttributeUsage(AttributeTargets.Parameter)]
public sealed class Utf16BufferAttribute : Attribute
{
}
