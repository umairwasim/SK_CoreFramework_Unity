/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using UnityEngine;
using UnityEditor;

namespace SKC.Editor.SDKHub
{
    [Serializable]
    public class SDKPackageReceipt
    {
        public string id;
        public string version;
        public string installedAt;
        public List<string> installedPaths = new List<string>();

        public static bool IsValidAssetPath(string path) => SDKPackageReceiptManager.IsValidAssetPath(path);
    }

    /// <summary>
    /// Reads .unitypackage tar.gz contents directly and tracks installed files for clean uninstallation.
    /// </summary>
    public static class SDKPackageReceiptManager
    {
        private const string ReceiptsDir = "ProjectSettings/SDKHub_Receipts";

        public static string GetReceiptPath(string sdkId)
        {
            return Path.Combine(ReceiptsDir, $"{sdkId}.json");
        }

        public static void SaveReceipt(string sdkId, string version, List<string> paths)
        {
            if (string.IsNullOrEmpty(sdkId) || paths == null) return;

            try
            {
                if (!Directory.Exists(ReceiptsDir))
                {
                    Directory.CreateDirectory(ReceiptsDir);
                }

                var receipt = new SDKPackageReceipt
                {
                    id = sdkId,
                    version = version ?? "unknown",
                    installedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                    installedPaths = new List<string>(paths)
                };

                string json = JsonUtility.ToJson(receipt, true);
                File.WriteAllText(GetReceiptPath(sdkId), json);
                Debug.Log($"[SDKHub] Saved install receipt for '{sdkId}' with {paths.Count} files.");
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SDKHub] Failed to save receipt for '{sdkId}': {ex.Message}");
            }
        }

        public static SDKPackageReceipt LoadReceipt(string sdkId)
        {
            if (string.IsNullOrEmpty(sdkId)) return null;

            string path = GetReceiptPath(sdkId);
            if (!File.Exists(path)) return null;

            try
            {
                string json = File.ReadAllText(path);
                var receipt = JsonUtility.FromJson<SDKPackageReceipt>(json);
                if (receipt != null && receipt.installedPaths != null)
                {
                    receipt.installedPaths.RemoveAll(p => !IsValidAssetPath(p));
                }
                return receipt;
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SDKHub] Failed to read receipt for '{sdkId}': {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Validates that an asset path is a well-formed Unity project path and contains no illegal characters or PaxHeader headers.
        /// </summary>
        public static bool IsValidAssetPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return false;
            if (path.Contains('\n') || path.Contains('\r')) return false;
            if (path.IndexOfAny(Path.GetInvalidPathChars()) >= 0) return false;
            string normalized = path.Trim().Replace("\\", "/");
            return normalized.StartsWith("Assets/", StringComparison.OrdinalIgnoreCase)
                || normalized.StartsWith("ProjectSettings/", StringComparison.OrdinalIgnoreCase)
                || normalized.StartsWith("Packages/", StringComparison.OrdinalIgnoreCase);
        }

        public static void DeleteReceipt(string sdkId)
        {
            if (string.IsNullOrEmpty(sdkId)) return;

            string path = GetReceiptPath(sdkId);
            if (File.Exists(path))
            {
                try
                {
                    File.Delete(path);
                }
                catch (Exception)
                {
                    // ignored
                }
            }
        }

        /// <summary>
        /// Reads all asset paths from a .unitypackage (tar.gz) archive by parsing the internal 'pathname' files.
        /// Does not require third-party libraries.
        /// </summary>
        public static List<string> ReadPathsFromUnityPackage(string packageFilePath)
        {
            var result = new List<string>();
            if (!File.Exists(packageFilePath)) return result;

            byte[] headerBuffer = new byte[512];
            byte[] skipBuffer = new byte[4096];

            try
            {
                using (var fileStream = File.OpenRead(packageFilePath))
                using (var gzStream = new GZipStream(fileStream, CompressionMode.Decompress))
                {
                    while (true)
                    {
                        int headerBytesRead = ReadExact(gzStream, headerBuffer, 0, 512);
                        if (headerBytesRead < 512) break;

                        // Check for empty block (end of archive)
                        bool allZero = true;
                        for (int i = 0; i < 100; i++)
                        {
                            if (headerBuffer[i] != 0)
                            {
                                allZero = false;
                                break;
                            }
                        }
                        if (allZero) break;

                        // Read file name from header (0..99)
                        string entryName = ReadNullTerminatedString(headerBuffer, 0, 100);

                        // Read file size from header (124..135 octal)
                        string sizeString = ReadNullTerminatedString(headerBuffer, 124, 12).Trim();
                        long fileSize = 0;
                        if (!string.IsNullOrEmpty(sizeString))
                        {
                            try { fileSize = Convert.ToInt64(sizeString, 8); } catch { }
                        }

                        int padding = (int)((512 - (fileSize % 512)) % 512);

                        bool isPaxHeader = entryName.StartsWith("PaxHeader", StringComparison.OrdinalIgnoreCase)
                                        || entryName.Contains("/PaxHeader")
                                        || entryName.Contains("@PaxHeader");

                        if (!isPaxHeader && entryName.EndsWith("/pathname", StringComparison.OrdinalIgnoreCase) && fileSize > 0 && fileSize < 4096)
                        {
                            byte[] pathBytes = new byte[fileSize];
                            ReadExact(gzStream, pathBytes, 0, (int)fileSize);
                            string rawString = Encoding.UTF8.GetString(pathBytes);
                            string[] lines = rawString.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

                            foreach (var line in lines)
                            {
                                string candidate = line.Trim().Replace("\\", "/");
                                if (IsValidAssetPath(candidate) && !result.Contains(candidate))
                                {
                                    result.Add(candidate);
                                    break;
                                }
                            }

                            if (padding > 0)
                            {
                                SkipBytes(gzStream, padding, skipBuffer);
                            }
                        }
                        else
                        {
                            long bytesToSkip = fileSize + padding;
                            SkipBytes(gzStream, bytesToSkip, skipBuffer);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SDKHub] Could not parse .unitypackage archive '{packageFilePath}': {ex.Message}");
            }

            return result;
        }

        private static int ReadExact(Stream stream, byte[] buffer, int offset, int count)
        {
            int totalRead = 0;
            while (totalRead < count)
            {
                int read = stream.Read(buffer, offset + totalRead, count - totalRead);
                if (read <= 0) break;
                totalRead += read;
            }
            return totalRead;
        }

        private static void SkipBytes(Stream stream, long count, byte[] buffer)
        {
            while (count > 0)
            {
                int toRead = (int)Math.Min(count, buffer.Length);
                int read = stream.Read(buffer, 0, toRead);
                if (read <= 0) break;
                count -= read;
            }
        }

        private static string ReadNullTerminatedString(byte[] buffer, int offset, int length)
        {
            int end = offset;
            int limit = offset + length;
            while (end < limit && buffer[end] != 0)
            {
                end++;
            }
            return Encoding.ASCII.GetString(buffer, offset, end - offset);
        }
    }
}
