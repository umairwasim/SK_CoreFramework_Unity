import os
import tarfile
import io
import json
import re
import datetime

PROJECT_ROOT = os.path.abspath(".")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "Builds", "SKCPackages")
os.makedirs(OUTPUT_DIR, exist_ok=True)

CATALOG = [
    {
        "id": "skc.core",
        "name": "SKC Core Foundation",
        "version": "1.0.0",
        "category": "Core",
        "description": "Service Locator (SKCore), Segmented SaveData, Event Bus, Logging, and ASMDEF Orchestration.",
        "defineSymbol": "",
        "isCore": True,
        "asmdefName": "SKC.Core",
        "fileName": "SKC.Core.unitypackage",
        "dependencies": [],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Boot",
            "Assets/Plugins/SKCFramework/_Scripts/SaveSystem",
            "Assets/Plugins/SKCFramework/_Scripts/Events",
            "Assets/Plugins/SKCFramework/_Scripts/Logging",
            "Assets/Plugins/SKCFramework/_Scripts/Constant",
            "Assets/Plugins/SKCFramework/_Scripts/Helpers",
            "Assets/Plugins/SKCFramework/_Scripts/Singleton Pattern",
            "Assets/Plugins/SKCFramework/_Scripts/Text",
            "Assets/Plugins/SKCFramework/_Scripts/Utils",
            "Assets/Plugins/SKCFramework/_Scripts/Editor",
            "Assets/Plugins/SKCFramework/_Scripts/SKC.Framework.asmdef",
            "Assets/Resources/LogSettings.asset",
            "Assets/Resources/SKCoreServiceSettings.asset"
        ]
    },
    {
        "id": "skc.economy",
        "name": "SKC Economy & Currencies",
        "version": "1.0.0",
        "category": "Economy",
        "description": "Multi-currency wallet, safe arithmetic transactions, and UI Fly token visual effects.",
        "defineSymbol": "SKC_HAS_ECONOMY",
        "isCore": False,
        "asmdefName": "SKC.Economy",
        "fileName": "SKC.Economy.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Economy",
            "Assets/Resources/CurrencySettings.asset"
        ]
    },
    {
        "id": "skc.dailyrewards",
        "name": "SKC Daily Rewards & Retention",
        "version": "1.0.0",
        "category": "Retention",
        "description": "7-day cycle retention calendars, streak tracking, and time-travel simulation tools.",
        "defineSymbol": "SKC_HAS_DAILY_REWARDS",
        "isCore": False,
        "asmdefName": "SKC.DailyRewards",
        "fileName": "SKC.DailyRewards.unitypackage",
        "dependencies": ["skc.core", "skc.economy", "skc.ui"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/DailyRewards",
            "Assets/Resources/DailyRewardSettings.asset"
        ]
    },
    {
        "id": "skc.levels",
        "name": "SKC Level Progression",
        "version": "1.0.0",
        "category": "Gameplay",
        "description": "Dynamic level loading, looping rules, prefab caching, and outcome flow management.",
        "defineSymbol": "SKC_HAS_LEVELS",
        "isCore": False,
        "asmdefName": "SKC.Levels",
        "fileName": "SKC.Levels.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Levels",
            "Assets/Resources/LevelSettings.asset"
        ]
    },
    {
        "id": "skc.audio",
        "name": "SKC Sound & Music Manager",
        "version": "1.0.0",
        "category": "Audio",
        "description": "BGM cross-fading, 3D SFX playback, pooling integration, and runtime volume controls.",
        "defineSymbol": "SKC_HAS_AUDIO",
        "isCore": False,
        "asmdefName": "SKC.Audio",
        "fileName": "SKC.Audio.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/SoundManager",
            "Assets/Plugins/SKCFramework/_Scripts/SOs/SoundData.cs",
            "Assets/Resources/Sounds.asset"
        ]
    },
    {
        "id": "skc.haptics",
        "name": "SKC Haptic Feedback",
        "version": "1.0.0",
        "category": "Feedback",
        "description": "Cross-platform mobile haptics with iOS Taptic Engine & Android vibration fallbacks.",
        "defineSymbol": "SKC_HAS_HAPTICS",
        "isCore": False,
        "asmdefName": "SKC.Haptics",
        "fileName": "SKC.Haptics.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Haptics"
        ]
    },
    {
        "id": "skc.pooling",
        "name": "SKC Object Pooling",
        "version": "1.0.0",
        "category": "System",
        "description": "Zero-GC GameObject pooling system with auto-expanding pools and warmup pre-allocation.",
        "defineSymbol": "SKC_HAS_POOLING",
        "isCore": False,
        "asmdefName": "SKC.Pooling",
        "fileName": "SKC.Pooling.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Pooling",
            "Assets/Resources/PoolList.asset"
        ]
    },
    {
        "id": "skc.transitions",
        "name": "SKC Screen Transitions",
        "version": "1.0.0",
        "category": "UI",
        "description": "Async scene and UI fades, curtains, and DOTween overlay animation sequences.",
        "defineSymbol": "SKC_HAS_TRANSITIONS",
        "isCore": False,
        "asmdefName": "SKC.Transitions",
        "fileName": "SKC.Transitions.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Transitions"
        ]
    },
    {
        "id": "skc.ui",
        "name": "SKC UI & Popups",
        "version": "1.0.0",
        "category": "UI",
        "description": "Popup queue manager, view transitions, responsive layout adapters, and toast overlays.",
        "defineSymbol": "SKC_HAS_UI",
        "isCore": False,
        "asmdefName": "SKC.UI",
        "fileName": "SKC.UI.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/UI",
            "Assets/Resources/UIData.asset"
        ]
    },
    {
        "id": "skc.inputs",
        "name": "SKC Input Service",
        "version": "1.0.0",
        "category": "Input",
        "description": "Unity New Input System abstraction with gesture detection and pointer event dispatching.",
        "defineSymbol": "SKC_HAS_INPUTS",
        "isCore": False,
        "asmdefName": "SKC.Inputs",
        "fileName": "SKC.Inputs.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/InputService"
        ]
    },
    {
        "id": "skc.ads",
        "name": "SKC Ads Mediation",
        "version": "1.0.0",
        "category": "Monetization",
        "description": "Mediation interfaces for Rewarded, Interstitial, and Banner ads with dummy simulation.",
        "defineSymbol": "SKC_HAS_ADS",
        "isCore": False,
        "asmdefName": "SKC.Ads",
        "fileName": "SKC.Ads.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Ads"
        ]
    },
    {
        "id": "skc.analytics",
        "name": "SKC Analytics Hub",
        "version": "1.0.0",
        "category": "Analytics",
        "description": "Composite multi-provider analytics dispatcher for GameAnalytics, Firebase, and ByteBrew.",
        "defineSymbol": "SKC_HAS_ANALYTICS",
        "isCore": False,
        "asmdefName": "SKC.Analytics",
        "fileName": "SKC.Analytics.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Analytics"
        ]
    },
    {
        "id": "skc.iap",
        "name": "SKC In-App Purchasing & No-Ads",
        "version": "1.0.0",
        "category": "Monetization",
        "description": "One-click No-Ads automation, entitlement restoration, and store receipt verification.",
        "defineSymbol": "SKC_HAS_IAP",
        "isCore": False,
        "asmdefName": "SKC.IAP",
        "fileName": "SKC.IAP.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/IAP"
        ]
    },
    {
        "id": "skc.privacy",
        "name": "SKC Privacy & Consent (ATT / UMP)",
        "version": "1.0.0",
        "category": "Compliance",
        "description": "Apple ATT and Google UMP/GDPR compliance workflows with automated dialog orchestration.",
        "defineSymbol": "SKC_HAS_PRIVACY",
        "isCore": False,
        "asmdefName": "SKC.Privacy",
        "fileName": "SKC.Privacy.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Privacy"
        ]
    },
    {
        "id": "skc.review",
        "name": "SKC In-App Review Prompt",
        "version": "1.0.0",
        "category": "Retention",
        "description": "Google Play In-App Review & Apple SKStoreReviewController smart milestone triggers.",
        "defineSymbol": "SKC_HAS_REVIEW",
        "isCore": False,
        "asmdefName": "SKC.Review",
        "fileName": "SKC.Review.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Review"
        ]
    },
    {
        "id": "skc.notifications",
        "name": "SKC Local Retention Notifications",
        "version": "1.0.0",
        "category": "Retention",
        "description": "Daily retention nudge reminders, streak protection alerts, and energy refills.",
        "defineSymbol": "SKC_HAS_NOTIFICATIONS",
        "isCore": False,
        "asmdefName": "SKC.Notifications",
        "fileName": "SKC.Notifications.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Notifications"
        ]
    },
    {
        "id": "skc.telemetry",
        "name": "SKC Telemetry & Funnels",
        "version": "1.0.0",
        "category": "Analytics",
        "description": "Automated level duration, lag spike counter, and low-FPS funnel telemetry tracking.",
        "defineSymbol": "SKC_HAS_TELEMETRY",
        "isCore": False,
        "asmdefName": "SKC.Telemetry",
        "fileName": "SKC.Telemetry.unitypackage",
        "dependencies": ["skc.core"],
        "assetPaths": [
            "Assets/Plugins/SKCFramework/_Scripts/Telemetry"
        ]
    }
]

def get_guid_from_meta(meta_path):
    if os.path.exists(meta_path):
        with open(meta_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line.strip().startswith('guid:'):
                    return line.strip().split(':', 1)[1].strip()
    return None

def collect_assets(path_list):
    results = {}
    for p in path_list:
        p_clean = p.replace('\\', '/').rstrip('/')
        full_p = os.path.join(PROJECT_ROOT, p_clean)
        
        if os.path.isdir(full_p):
            meta_p = full_p + ".meta"
            guid = get_guid_from_meta(meta_p)
            if guid:
                results[p_clean] = (full_p, meta_p, guid, True)
            
            for root, dirs, files in os.walk(full_p):
                for d in dirs:
                    d_full = os.path.join(root, d)
                    d_rel = os.path.relpath(d_full, PROJECT_ROOT).replace('\\', '/')
                    d_meta = d_full + ".meta"
                    d_guid = get_guid_from_meta(d_meta)
                    if d_guid:
                        results[d_rel] = (d_full, d_meta, d_guid, True)
                for f in files:
                    if f.endswith('.meta'):
                        continue
                    f_full = os.path.join(root, f)
                    f_rel = os.path.relpath(f_full, PROJECT_ROOT).replace('\\', '/')
                    f_meta = f_full + ".meta"
                    f_guid = get_guid_from_meta(f_meta)
                    if f_guid:
                        results[f_rel] = (f_full, f_meta, f_guid, False)
        elif os.path.isfile(full_p):
            meta_p = full_p + ".meta"
            guid = get_guid_from_meta(meta_p)
            if guid:
                results[p_clean] = (full_p, meta_p, guid, False)
    return results

def create_unitypackage(pkg_info, output_file):
    assets_map = collect_assets(pkg_info["assetPaths"])
    if not assets_map:
        print(f"Warning: No assets found for {pkg_info['name']}")
        return False
    
    with tarfile.open(output_file, "w:gz") as tar:
        root_info = tarfile.TarInfo(name=".")
        root_info.type = tarfile.DIRTYPE
        root_info.mtime = int(datetime.datetime.now().timestamp())
        tar.addfile(root_info)
        
        for unity_rel_path, (disk_path, meta_path, guid, is_dir) in assets_map.items():
            guid_dir = f"./{guid}"
            dir_info = tarfile.TarInfo(name=guid_dir)
            dir_info.type = tarfile.DIRTYPE
            dir_info.mtime = int(datetime.datetime.now().timestamp())
            tar.addfile(dir_info)
            
            # pathname
            pathname_content = unity_rel_path.encode('utf-8')
            pathname_info = tarfile.TarInfo(name=f"{guid_dir}/pathname")
            pathname_info.size = len(pathname_content)
            pathname_info.mtime = int(datetime.datetime.now().timestamp())
            tar.addfile(pathname_info, io.BytesIO(pathname_content))
            
            # asset.meta
            if os.path.exists(meta_path):
                with open(meta_path, 'rb') as f:
                    meta_bytes = f.read()
                meta_info = tarfile.TarInfo(name=f"{guid_dir}/asset.meta")
                meta_info.size = len(meta_bytes)
                meta_info.mtime = int(os.path.getmtime(meta_path))
                tar.addfile(meta_info, io.BytesIO(meta_bytes))
            
            # asset (only if file)
            if not is_dir and os.path.exists(disk_path):
                with open(disk_path, 'rb') as f:
                    asset_bytes = f.read()
                asset_info = tarfile.TarInfo(name=f"{guid_dir}/asset")
                asset_info.size = len(asset_bytes)
                asset_info.mtime = int(os.path.getmtime(disk_path))
                tar.addfile(asset_info, io.BytesIO(asset_bytes))
                
    return True

exported_packages = []
for pkg in CATALOG:
    pkg_file = os.path.join(OUTPUT_DIR, pkg["fileName"])
    success = create_unitypackage(pkg, pkg_file)
    if os.path.exists(pkg_file):
        size = os.path.getsize(pkg_file)
        pkg["fileSizeBytes"] = size
        pkg["downloadUrl"] = f"https://github.com/SemihKC94/skc-unity-plugins/releases/download/v1.0.0/{pkg['fileName']}"
        exported_packages.append(pkg)
        if success:
            print(f"Exported {pkg['name']} -> {pkg['fileName']} ({size} bytes)")
        else:
            print(f"Retained existing package {pkg['name']} -> {pkg['fileName']} ({size} bytes)")

manifest_data = {
    "schemaVersion": "1.0.0",
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "packages": exported_packages
}

manifest_json = json.dumps(manifest_data, indent=2)
manifest_path = os.path.join(OUTPUT_DIR, "packages_manifest.json")
with open(manifest_path, 'w', encoding='utf-8') as f:
    f.write(manifest_json)

# Save embedded copy
res_dir = os.path.join(PROJECT_ROOT, "Assets", "Resources")
os.makedirs(res_dir, exist_ok=True)
embedded_path = os.path.join(res_dir, "SKCPackagesManifest.json")
with open(embedded_path, 'w', encoding='utf-8') as f:
    f.write(manifest_json)

print(f"\nSUCCESS: Preserved/Exported {len(exported_packages)} packages in {manifest_path}")
