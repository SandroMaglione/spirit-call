// Generated from the saved Blender source by art/enemies/scripts/common.py.
import url from "../../../../art/enemies/swarmer/swarmer.glb?url"
import type { ModelSpec } from "../../models.ts"

export const swarmerModel = { url,
  "height": 0.6599999666213989,
  "clips": {
    "Idle": {
      "lastKeySeconds": 1.9666666666666666,
      "loopSeconds": 2
    },
    "Run": {
      "lastKeySeconds": 0.5666666666666667,
      "loopSeconds": 0.6
    },
    "Windup": {
      "lastKeySeconds": 1,
      "loopSeconds": null
    },
    "Active": {
      "lastKeySeconds": 0.4,
      "loopSeconds": null
    },
    "Recovery": {
      "lastKeySeconds": 0.7,
      "loopSeconds": null
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
