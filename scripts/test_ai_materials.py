import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('materials', Path(__file__).with_name('prepare-ai-materials.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class SurfaceTests(unittest.TestCase):
    def test_repeated_edge_mismatch_is_repaired_without_flattening_local_detail(self):
        rng = np.random.default_rng(19)
        a = rng.uniform(.3, .7, (128, 128, 3)) + np.linspace(0, .3, 128)[None, :, None]
        out = m.periodic_colour(a)
        self.assertLess(m.edge_metrics(out)['wrapRatio'], 1.3)
        self.assertGreater(np.std(np.diff(out, axis=1)), .1)
        self.assertTrue(np.allclose(a.mean(axis=(0, 1)), out.mean(axis=(0, 1))))

    def test_each_authored_normal_field_is_finite_unit_length_with_physical_roughness(self):
        for kind in ['travertine', 'oak', 'bronze']:
            normal, rough, metal, height = m.authored_maps(kind, 128, 1.2)
            self.assertTrue(np.isfinite(normal).all())
            self.assertTrue(np.allclose(np.linalg.norm(normal, axis=-1), 1))
            self.assertGreater(height.std(), 0)
            self.assertGreaterEqual(rough.min(), .2)
            self.assertLessEqual(rough.max(), .98)
            self.assertEqual(metal > 0, kind == 'bronze')


if __name__ == '__main__':
    unittest.main()
