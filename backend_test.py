import requests
import json
import sys
from datetime import datetime, timedelta
import uuid

class DiscordStreamControlPanelTester:
    def __init__(self, base_url="https://44952724-0e4c-465a-9d73-c0e1c371629a.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_resources = {
            'channels': [],
            'presets': [],
            'events': []
        }

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
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
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.status_code != 204:
                    try:
                        response_data = response.json()
                        if isinstance(response_data, dict) and 'id' in response_data:
                            return True, response_data
                        return True, response_data
                    except:
                        return True, {}
                return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                if response.text:
                    try:
                        error_data = response.json()
                        print(f"   Error: {error_data}")
                    except:
                        print(f"   Error text: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health(self):
        """Test health endpoint"""
        success, response = self.run_test("Health Check", "GET", "/api/health", 200)
        return success and response.get('status') == 'ok'

    def test_bootstrap(self):
        """Test bootstrap endpoint"""
        success, response = self.run_test("Bootstrap State", "GET", "/api/bootstrap", 200)
        if success and 'state' in response:
            print(f"   Found {len(response['state'].get('channels', []))} channels, {len(response['state'].get('presets', []))} presets, {len(response['state'].get('events', []))} events")
            return True
        return False

    def test_profiles(self):
        """Test profiles endpoint"""
        success, response = self.run_test("Quality Profiles", "GET", "/api/profiles", 200)
        return success and 'qualityProfiles' in response and 'bufferProfiles' in response

    def test_create_channel(self):
        """Test channel creation"""
        channel_data = {
            "name": f"Test Channel {datetime.now().strftime('%H%M%S')}",
            "guildId": "123456789012345678",
            "channelId": "987654321098765432",
            "streamMode": "go-live",
            "description": "Test channel for API testing"
        }
        success, response = self.run_test("Create Channel", "POST", "/api/channels", 201, channel_data)
        if success and 'id' in response:
            self.created_resources['channels'].append(response['id'])
            return response['id']
        return None

    def test_update_channel(self, channel_id):
        """Test channel update"""
        update_data = {
            "name": f"Updated Channel {datetime.now().strftime('%H%M%S')}",
            "guildId": "123456789012345678",
            "channelId": "987654321098765432",
            "streamMode": "camera",
            "description": "Updated test channel"
        }
        success, response = self.run_test("Update Channel", "PUT", f"/api/channels/{channel_id}", 200, update_data)
        return success

    def test_create_preset(self):
        """Test preset creation"""
        preset_data = {
            "name": f"Test Preset {datetime.now().strftime('%H%M%S')}",
            "sourceUrl": "https://example.com/stream.mp4",
            "sourceMode": "direct",
            "qualityProfile": "720p30",
            "bufferProfile": "auto",
            "description": "Test preset for API testing",
            "includeAudio": True,
            "width": 1280,
            "height": 720,
            "fps": 30,
            "bitrateVideoKbps": 4500,
            "maxBitrateVideoKbps": 6500,
            "bitrateAudioKbps": 160,
            "videoCodec": "H264",
            "hardwareAcceleration": False,
            "minimizeLatency": False
        }
        success, response = self.run_test("Create Preset", "POST", "/api/presets", 201, preset_data)
        if success and 'id' in response:
            self.created_resources['presets'].append(response['id'])
            return response['id']
        return None

    def test_update_preset(self, preset_id):
        """Test preset update"""
        update_data = {
            "name": f"Updated Preset {datetime.now().strftime('%H%M%S')}",
            "sourceUrl": "https://example.com/updated_stream.mp4",
            "sourceMode": "yt-dlp",
            "qualityProfile": "1080p30",
            "bufferProfile": "stable",
            "description": "Updated test preset",
            "includeAudio": True,
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "bitrateVideoKbps": 7000,
            "maxBitrateVideoKbps": 9500,
            "bitrateAudioKbps": 160,
            "videoCodec": "H265",
            "hardwareAcceleration": True,
            "minimizeLatency": True
        }
        success, response = self.run_test("Update Preset", "PUT", f"/api/presets/{preset_id}", 200, update_data)
        return success

    def test_create_event_single(self, channel_id, preset_id):
        """Test single event creation"""
        start_time = datetime.now() + timedelta(hours=1)
        end_time = start_time + timedelta(hours=2)
        
        event_data = {
            "name": f"Test Single Event {datetime.now().strftime('%H%M%S')}",
            "channelId": channel_id,
            "presetId": preset_id,
            "startAt": start_time.isoformat(),
            "endAt": end_time.isoformat(),
            "description": "Test single event",
            "recurrence": {"kind": "once"}
        }
        success, response = self.run_test("Create Single Event", "POST", "/api/events", 201, event_data)
        if success and 'events' in response and response['events']:
            event_id = response['events'][0]['id']
            self.created_resources['events'].append(event_id)
            return event_id
        return None

    def test_create_event_recurring(self, channel_id, preset_id):
        """Test recurring daily event creation"""
        start_time = datetime.now() + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        until_time = start_time + timedelta(days=5)
        
        event_data = {
            "name": f"Test Daily Event {datetime.now().strftime('%H%M%S')}",
            "channelId": channel_id,
            "presetId": preset_id,
            "startAt": start_time.isoformat(),
            "endAt": end_time.isoformat(),
            "description": "Test recurring daily event",
            "recurrence": {
                "kind": "daily",
                "interval": 1,
                "until": until_time.isoformat()
            }
        }
        success, response = self.run_test("Create Recurring Event", "POST", "/api/events", 201, event_data)
        if success and 'events' in response and response['events']:
            # Add all created event IDs
            for event in response['events']:
                self.created_resources['events'].append(event['id'])
            return response['events'][0]['id']
        return None

    def test_event_actions(self, event_id):
        """Test event start and cancel actions"""
        # Test start event
        start_success, _ = self.run_test("Start Event", "POST", f"/api/events/{event_id}/start", 200)
        
        # Test cancel event (since we just started it)
        cancel_success, _ = self.run_test("Cancel Event", "POST", f"/api/events/{event_id}/cancel", 200)
        
        return start_success and cancel_success

    def test_manual_start_stop(self, channel_id, preset_id):
        """Test manual stream start and stop"""
        stop_time = datetime.now() + timedelta(hours=1)
        manual_data = {
            "channelId": channel_id,
            "presetId": preset_id,
            "stopAt": stop_time.isoformat()
        }
        
        # Test manual start
        start_success, _ = self.run_test("Manual Stream Start", "POST", "/api/manual/start", 200, manual_data)
        
        # Test stop
        stop_success, _ = self.run_test("Stop Stream", "POST", "/api/stop", 200)
        
        return start_success and stop_success

    def test_get_logs(self):
        """Test logs retrieval"""
        success, response = self.run_test("Get Logs", "GET", "/api/logs", 200)
        return success and isinstance(response, list)

    def cleanup_resources(self):
        """Clean up created test resources"""
        print("\n🧹 Cleaning up test resources...")
        
        # Delete events first (they reference channels and presets)
        for event_id in self.created_resources['events']:
            try:
                requests.delete(f"{self.base_url}/api/events/{event_id}", timeout=5)
                print(f"   Deleted event {event_id}")
            except:
                pass
        
        # Delete presets
        for preset_id in self.created_resources['presets']:
            try:
                requests.delete(f"{self.base_url}/api/presets/{preset_id}", timeout=5)
                print(f"   Deleted preset {preset_id}")
            except:
                pass
        
        # Delete channels
        for channel_id in self.created_resources['channels']:
            try:
                requests.delete(f"{self.base_url}/api/channels/{channel_id}", timeout=5)
                print(f"   Deleted channel {channel_id}")
            except:
                pass

def main():
    print("🚀 Starting Discord Stream Control Panel API Tests")
    print("=" * 60)
    
    tester = DiscordStreamControlPanelTester()
    
    try:
        # Basic functionality tests
        if not tester.test_health():
            print("❌ Health check failed, stopping tests")
            return 1
        
        if not tester.test_bootstrap():
            print("❌ Bootstrap failed, stopping tests") 
            return 1
            
        if not tester.test_profiles():
            print("❌ Profiles test failed")
            
        # Channel CRUD tests
        channel_id = tester.test_create_channel()
        if not channel_id:
            print("❌ Channel creation failed, stopping dependent tests")
            return 1
            
        if not tester.test_update_channel(channel_id):
            print("❌ Channel update failed")
            
        # Preset CRUD tests
        preset_id = tester.test_create_preset()
        if not preset_id:
            print("❌ Preset creation failed, stopping dependent tests")
            return 1
            
        if not tester.test_update_preset(preset_id):
            print("❌ Preset update failed")
            
        # Event tests (require both channel and preset)
        single_event_id = tester.test_create_event_single(channel_id, preset_id)
        recurring_event_id = tester.test_create_event_recurring(channel_id, preset_id)
        
        if single_event_id:
            if not tester.test_event_actions(single_event_id):
                print("❌ Event actions failed")
        
        # Manual stream tests
        if not tester.test_manual_start_stop(channel_id, preset_id):
            print("❌ Manual stream start/stop failed")
            
        # Logs test
        if not tester.test_get_logs():
            print("❌ Logs retrieval failed")
        
        # Final results
        print("\n" + "=" * 60)
        print(f"📊 Tests completed: {tester.tests_passed}/{tester.tests_run} passed")
        success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
        print(f"📈 Success rate: {success_rate:.1f}%")
        
        return 0 if tester.tests_passed == tester.tests_run else 1
        
    except KeyboardInterrupt:
        print("\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        return 1
    finally:
        tester.cleanup_resources()

if __name__ == "__main__":
    sys.exit(main())