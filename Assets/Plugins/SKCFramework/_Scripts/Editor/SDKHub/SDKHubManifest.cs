/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;

namespace SKC.Editor.SDKHub
{
    [Serializable]
    public enum SDKCategory
    {
        All,
        Analytics,
        Ads,
        Attribution,
        Utilities
    }

    [Serializable]
    public class SDKItem
    {
        public string id;
        public string name;
        public string version;
        public SDKCategory category;
        public string description;
        public string author;
        public string downloadUrl;
        public string documentationUrl;
        public string scriptingDefineSymbol;
        public string detectionPath; // Path in Assets (e.g. Assets/GameAnalytics or Assets/MaxSdk) to detect installation
        public string iconName;
    }

    [Serializable]
    public class SDKHubManifestData
    {
        public string manifestVersion = "1.0.0";
        public string lastUpdated = "";
        public List<SDKItem> items = new List<SDKItem>();
    }
}
