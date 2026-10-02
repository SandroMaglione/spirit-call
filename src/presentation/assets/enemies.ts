import { chaserModel } from "./enemies/chaser.ts"
import { swarmerModel } from "./enemies/swarmer.ts"
import { dummyModel } from "./enemies/dummy.ts"
import { shooterModel } from "./enemies/shooter.ts"
import { sniperModel } from "./enemies/sniper.ts"
import { chargerModel } from "./enemies/charger.ts"
import { bruteModel } from "./enemies/brute.ts"

export const enemyModels = { enemyBrute: bruteModel, enemyCharger: chargerModel, enemySniper: sniperModel, enemyShooter: shooterModel, enemyChaser: chaserModel, enemySwarmer: swarmerModel, enemyDummy: dummyModel }
