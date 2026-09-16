using System.Net;

namespace Tracking.Core;

public static class ServerAddress
{
    public static Uri Normalize(string rawValue)
    {
        var value = rawValue.Trim();
        if (value.Length == 0) throw new ArgumentException("Enter your tracking server address.");
        if (!value.Contains("://", StringComparison.Ordinal)) value = $"https://{value}";
        if (!Uri.TryCreate(value.TrimEnd('/'), UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            throw new ArgumentException("Enter a valid https:// server address without credentials, a query, or a fragment.");
        return uri;
    }

}
