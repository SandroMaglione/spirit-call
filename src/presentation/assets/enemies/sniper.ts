// Generated from the saved Blender source by art/enemies/scripts/common.py.
import url from "../../../../art/enemies/sniper/sniper.glb?url"
import type { ModelSpec } from "../../models.ts"

export const sniperModel = { url,
  "height": 2.1518964767456055,
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
