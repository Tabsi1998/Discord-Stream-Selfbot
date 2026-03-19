#!/usr/bin/env python3
import requests
import sys
import json
from datetime import datetime

class DiscordSelfbotAPITester:
    def __init__(self, base_url="https://44952724-0e4c-465a-9d73-c0e1c371629a.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, validation_fn=None):
        """Run a single API test with optional response validation"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success and validation_fn:
                try:
                    response_data = response.json() if response.content else {}
                    validation_success = validation_fn(response_data)
                    if not validation_success:
                        success = False
                        print(f"❌ Validation failed for {name}")
                except Exception as e:
                    success = False
                    print(f"❌ Validation error: {str(e)}")

            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
            else:
                self.failed_tests.append(name)
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                if response.content:
                    try:
                        error_data = response.json()
                        print(f"   Response: {json.dumps(error_data, indent=2)}")
                    except:
                        print(f"   Response: {response.text[:200]}")

            return success, response.json() if response.content and success else {}

        except Exception as e:
            self.failed_tests.append(name)
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_quality_profiles(self):
        """Test the new quality profiles - should NOT have 'original', should have 4K options"""
        def validate_profiles(response_data):
            profiles = response_data.get('qualityProfiles', {})
            
            # Should NOT contain 'original' profile
            if 'original' in profiles:
                print("❌ 'original' profile still exists (should be removed)")
                return False
            print("✅ 'original' profile correctly removed")
            
            # Should contain 2160p30 profile
            if '2160p30' not in profiles:
                print("❌ '2160p30' profile missing")
                return False
            p30 = profiles['2160p30']
            if p30.get('width') != 3840 or p30.get('height') != 2160 or p30.get('fps') != 30:
                print(f"❌ '2160p30' profile incorrect: {p30}")
                return False
            print("✅ '2160p30' profile correct: 3840x2160@30fps")
            
            # Should contain 2160p60 profile
            if '2160p60' not in profiles:
                print("❌ '2160p60' profile missing")
                return False
            p60 = profiles['2160p60']
            if p60.get('width') != 3840 or p60.get('height') != 2160 or p60.get('fps') != 60:
                print(f"❌ '2160p60' profile incorrect: {p60}")
                return False
            print("✅ '2160p60' profile correct: 3840x2160@60fps")
            
            # Check labels
            label30 = profiles['2160p30'].get('label')
            label60 = profiles['2160p60'].get('label')
            if label30 != '4K / 30 FPS':
                print(f"❌ '2160p30' label incorrect: {label30}")
                return False
            if label60 != '4K / 60 FPS':
                print(f"❌ '2160p60' label incorrect: {label60}")
                return False
            print("✅ 4K profile labels correct")
            
            return True

        return self.run_test(
            "Quality profiles - check 4K profiles and removal of 'original'",
            "GET", "api/profiles", 200, validation_fn=validate_profiles
        )

    def test_4k_bitrate_recommendations(self):
        """Test 4K bitrate recommendations"""
        tests = [
            {
                'name': '4K H264 30fps bitrate',
                'params': 'width=3840&height=2160&fps=30&codec=H264',
                'expected_min_video': 9000,  # Should be around 10000-14000
                'expected_max_video': 12000
            },
            {
                'name': '4K H264 60fps bitrate', 
                'params': 'width=3840&height=2160&fps=60&codec=H264',
                'expected_min_video': 13000,  # Should be around 14000-18000
                'expected_max_video': 16000
            },
            {
                'name': '4K H265 30fps bitrate',
                'params': 'width=3840&height=2160&fps=30&codec=H265',
                'expected_min_video': 7000,  # H265 should be ~80% of H264
                'expected_max_video': 10000
            },
            {
                'name': '4K H265 60fps bitrate',
                'params': 'width=3840&height=2160&fps=60&codec=H265', 
                'expected_min_video': 10000,  # H265 should be ~80% of H264
                'expected_max_video': 13000
            }
        ]
        
        all_passed = True
        for test in tests:
            def validate_bitrate(response_data):
                video = response_data.get('video', 0)
                video_max = response_data.get('videoMax', 0)
                audio = response_data.get('audio', 0)
                
                if video < test['expected_min_video'] or video > test['expected_max_video'] + 2000:
                    print(f"❌ Video bitrate {video} not in expected range {test['expected_min_video']}-{test['expected_max_video']+2000}")
                    return False
                
                if video_max <= video:
                    print(f"❌ Max video bitrate {video_max} should be > video bitrate {video}")
                    return False
                    
                if audio != 160:
                    print(f"❌ Audio bitrate {audio} should be 160")
                    return False
                    
                print(f"✅ Bitrates correct: video={video}, max={video_max}, audio={audio}")
                return True

            success, _ = self.run_test(
                test['name'],
                "GET", f"api/recommend-bitrate?{test['params']}", 200, validation_fn=validate_bitrate
            )
            if not success:
                all_passed = False
        
        return all_passed

    def test_preset_creation_with_4k(self):
        """Test creating presets with 4K quality profiles"""
        # Test 2160p30 preset creation
        preset_data_30 = {
            "name": "Test 4K 30fps Preset",
            "sourceUrl": "https://example.com/test.mp4",
            "qualityProfile": "2160p30",
            "description": "Test preset for 4K 30fps"
        }
        
        success_30, response_30 = self.run_test(
            "Create preset with 2160p30 profile",
            "POST", "api/presets", 201, data=preset_data_30
        )
        
        preset_id_30 = None
        if success_30 and response_30:
            preset_id_30 = response_30.get('id')
            if (response_30.get('width') != 3840 or 
                response_30.get('height') != 2160 or 
                response_30.get('fps') != 30):
                print(f"❌ 2160p30 preset has wrong resolution: {response_30.get('width')}x{response_30.get('height')}@{response_30.get('fps')}fps")
                success_30 = False
            else:
                print(f"✅ 2160p30 preset created with correct resolution: 3840x2160@30fps")

        # Test 2160p60 preset creation
        preset_data_60 = {
            "name": "Test 4K 60fps Preset", 
            "sourceUrl": "https://example.com/test60.mp4",
            "qualityProfile": "2160p60",
            "description": "Test preset for 4K 60fps"
        }
        
        success_60, response_60 = self.run_test(
            "Create preset with 2160p60 profile",
            "POST", "api/presets", 201, data=preset_data_60
        )
        
        preset_id_60 = None
        if success_60 and response_60:
            preset_id_60 = response_60.get('id')
            if (response_60.get('width') != 3840 or 
                response_60.get('height') != 2160 or 
                response_60.get('fps') != 60):
                print(f"❌ 2160p60 preset has wrong resolution: {response_60.get('width')}x{response_60.get('height')}@{response_60.get('fps')}fps")
                success_60 = False
            else:
                print(f"✅ 2160p60 preset created with correct resolution: 3840x2160@60fps")

        # Cleanup - delete test presets
        if preset_id_30:
            self.run_test("Delete 2160p30 test preset", "DELETE", f"api/presets/{preset_id_30}", 204)
        if preset_id_60:
            self.run_test("Delete 2160p60 test preset", "DELETE", f"api/presets/{preset_id_60}", 204)

        return success_30 and success_60

    def test_basic_endpoints(self):
        """Test basic endpoints are still working"""
        tests = [
            ("Health check", "GET", "api/health", 200),
            ("Bootstrap", "GET", "api/bootstrap", 200),
            ("Get state", "GET", "api/state", 200),
        ]
        
        all_passed = True
        for name, method, endpoint, status in tests:
            success, _ = self.run_test(name, method, endpoint, status)
            if not success:
                all_passed = False
        
        return all_passed

    def run_full_test_suite(self):
        """Run all tests"""
        print("=" * 60)
        print("Discord Stream Selfbot Control Panel - Testing")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)

        # Test basic functionality first
        print("\n📋 Testing Basic Endpoints...")
        self.test_basic_endpoints()

        # Test the main changes from this iteration
        print("\n🎯 Testing Quality Profile Changes...")
        self.test_quality_profiles()

        print("\n💡 Testing 4K Bitrate Recommendations...")
        self.test_4k_bitrate_recommendations()

        print("\n🎬 Testing 4K Preset Creation...")
        self.test_preset_creation_with_4k()

        # Final results
        print("\n" + "=" * 60)
        print("TEST RESULTS")
        print("=" * 60)
        print(f"Tests passed: {self.tests_passed}/{self.tests_run}")
        
        if self.failed_tests:
            print(f"\nFailed tests:")
            for test in self.failed_tests:
                print(f"  ❌ {test}")
        else:
            print("\n🎉 All tests passed!")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"Success rate: {success_rate:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = DiscordSelfbotAPITester()
    success = tester.run_full_test_suite()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())