import { chaserModel } from "./enemies/chaser.ts"
import { swarmerModel } from "./enemies/swarmer.ts"
import { dummyModel } from "./enemies/dummy.ts"
import { shooterModel } from "./enemies/shooter.ts"

export const enemyModels = { enemyShooter: shooterModel, enemyChaser: chaserModel, enemySwarmer: swarmerModel, enemyDummy: dummyModel }
