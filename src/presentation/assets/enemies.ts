import { chaserModel } from "./enemies/chaser.ts"
import { swarmerModel } from "./enemies/swarmer.ts"
import { dummyModel } from "./enemies/dummy.ts"
import { sparringDummyModel } from "./enemies/sparring-dummy.ts"
import { heavyDummyModel } from "./enemies/heavy-dummy.ts"
import { shooterModel } from "./enemies/shooter.ts"
import { sniperModel } from "./enemies/sniper.ts"
import { chargerModel } from "./enemies/charger.ts"
import { bruteModel } from "./enemies/brute.ts"
import { guardianModel } from "./enemies/guardian.ts"
import { galeCasterModel } from "./enemies/gale-caster.ts"
import { juggernautModel } from "./enemies/juggernaut.ts"
import { wardenModel } from "./enemies/warden.ts"
import { stalkerModel } from "./enemies/stalker.ts"
import { volatileModel } from "./enemies/volatile.ts"

export const enemyModels = {
  enemyDummy: dummyModel,
  enemySparringDummy: sparringDummyModel,
  enemyHeavyDummy: heavyDummyModel,
  enemyChaser: chaserModel,
  enemyShooter: shooterModel,
  enemyBrute: bruteModel,
  enemySwarmer: swarmerModel,
  enemyCharger: chargerModel,
  enemySniper: sniperModel,
  enemyGuardian: guardianModel,
  enemyGaleCaster: galeCasterModel,
  enemyJuggernaut: juggernautModel,
  enemyWarden: wardenModel,
  enemyStalker: stalkerModel,
  enemyVolatile: volatileModel
}
