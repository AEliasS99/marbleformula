import importlib.util
import unittest
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('check_scene', Path(__file__).with_name('check-scene.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MissingSceneTest(unittest.TestCase):
    def test_hud_does_not_hide_missing_canvas(self):
        for background in [0, 255]:
            frame = np.full((180, 320, 3), background, dtype=np.uint8)
            frame[:50, :40] = [200, 120, 20]  # intact timing tower
            frame[90:93, 160:165] = [70, 70, 70]  # driver label
            self.assertTrue(module.blank_scene(frame))

    def test_shaded_snow_and_road_are_not_blank(self):
        frame = np.full((180, 320, 3), 248, dtype=np.uint8)
        frame[40:150, 80:180] = [90, 130, 160]
        self.assertFalse(module.blank_scene(frame))

if __name__ == '__main__':
    unittest.main()
