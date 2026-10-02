// Generated from the saved Blender source by art/enemies/scripts/common.py.
import url from "../../../../art/enemies/dummy/dummy.glb?url"
import type { ModelSpec } from "../../models.ts"

export const dummyModel = { url,
  "height": 1.6200000047683716,
  "clips": {
    "Idle": {
      "lastKeySeconds": 1.9666666666666666,
      "loopSeconds": 2
    },
    "Hurt": {
      "lastKeySeconds": 0.3,
      "loopSeconds": null
    },
    "Death": {
      "lastKeySeconds": 0.7,
      "loopSeconds": null
    },
    "Spawn": {
      "lastKeySeconds": 0.3,
      "loopSeconds": null
    }
  }
} satisfies ModelSpec
