"""Pose choreography in frames at 30 fps. The game owns time and travel.

Contact is one frame into each move, close to the game's 40 ms target.
Preparation lives in guard and in the previous move's follow-through.
"""
import math

GUARD = dict(hip=(.035,-.035,-.10),twist=.30,lean=.16,
             hand=(.65,-.26,1.30),yaw=1.10,pitch=.52,
             left=(-.48,-.18,.91),feet=(-.16,0,.14,0),
             pivotL=.12,pivotR=-.20,spin=0,bank=0,blade_roll=0)


def mix(a,b,t):
    out = {}
    for key in GUARD.keys() | a.keys() | b.keys():
        av,bv = a.get(key,GUARD.get(key,0)),b.get(key,GUARD.get(key,0))
        out[key] = tuple(x+(y-x)*t for x,y in zip(av,bv)) if isinstance(av,tuple) else av+(bv-av)*t
    return out


def smooth(t):
    return t*t*(3-2*t)


def sequence(keys,frame):
    a,b = next((a,b) for a,b in zip(keys,keys[1:]) if a[0]<=frame<=b[0])
    t = (frame-a[0])/(b[0]-a[0])
    easing = b[2]
    t = 1-(1-t)**3 if easing=='settle' else t**2 if easing=='accelerate' else smooth(t) if easing=='smooth' else t
    return mix(a[1],b[1],t)


def idle(phase):
    breath = math.sin(phase*math.tau)
    s = dict(GUARD)
    s.update(hip=(.035+.012*breath,-.035,-.10+.017*breath),
             lean=.16+.015*breath,hand=(.65,-.26,1.30+.012*breath),
             pitch=.52+.02*breath,left=(-.48,-.18,.91+.022*breath),
             tail=.035*math.sin(phase*math.tau))
    return s


def run(phase):
    phase %= 1
    feet,rolls = [],{}
    for offset,label in [(0,'L'),(.5,'R')]:
        cycle = (phase+offset)%1
        if cycle<.44:
            t=cycle/.44
            y,z=-.28+.58*t,0
            roll=.30*max(0,(t-.65)/.35)
        else:
            t=(cycle-.44)/.56
            y,z=.30-.58*smooth(t),.23*math.sin(math.pi*t)**2
            roll=.18*math.sin(math.pi*t)
        feet.extend([y,z])
        rolls['roll'+label]=roll
    pulse=math.cos(phase*math.tau*2+.7)
    sway=math.sin(phase*math.tau)
    s=dict(GUARD)
    s.update(hip=(.025*sway,-.06,-.10+.045*pulse),lean=.37+.045*pulse,
             twist=.08*sway,bank=.025*sway,
             hand=(.62,-.04,1.12+.035*math.sin(phase*math.tau-.3)),
             yaw=1.70+.06*sway,pitch=.35+.035*pulse,
             left=(-.49,.02+.10*sway,.88),feet=tuple(feet),pivotL=0,pivotR=0,
             tail=.06*math.sin(phase*math.tau-.6),**rolls)
    return s


# Contact, overshoot, and the next loaded pose have different spacing.
# The spin keeps angular velocity through its passing poses, then brakes.
KEYS = [
    (1,GUARD,'linear'),
    (2,dict(hip=(-.045,-.11,-.11),twist=-.48,lean=.26,bank=-.06,
            hand=(.10,-.69,1.10),yaw=-.50,pitch=-.06,left=(-.62,.07,1.00),
            feet=(-.21,0,.14,.035),pivotR=-.45),'accelerate'),
    (4,dict(hip=(-.07,-.10,-.13),twist=-.72,lean=.24,bank=-.08,
            hand=(-.19,-.48,.91),yaw=-1.40,pitch=-.10,left=(-.67,.10,1.04),
            feet=(-.21,0,.13,0),pivotR=-.50),'settle'),
    (9,dict(hip=(-.055,-.04,-.13),twist=-.54,lean=.13,
            hand=(-.11,-.42,.90),yaw=-1.23,pitch=.04,left=(-.56,.07,.95),
            feet=(-.16,0,.14,0),pivotR=-.35),'smooth'),
    (10,dict(hip=(.035,-.10,-.08),twist=.40,lean=.23,bank=.06,
             hand=(.57,-.58,1.22),yaw=.50,pitch=.38,left=(-.60,.08,.97),
             feet=(-.12,.035,.02,0),pivotL=.38),'accelerate'),
    (12,dict(hip=(.055,-.06,-.05),twist=.62,lean=.13,bank=.04,
             hand=(.71,-.30,1.49),yaw=1.28,pitch=.58,left=(-.49,.12,.87),
             feet=(-.10,0,.02,0),pivotL=.35),'settle'),
    (16,dict(hip=(.035,-.02,-.12),twist=.34,lean=.12,
             hand=(.46,-.30,1.18),yaw=.12,pitch=.02,left=(-.44,-.09,.95),
             feet=(-.15,0,.16,0)),'smooth'),
    (17,dict(hip=(.015,-.14,-.13),twist=-.16,lean=.34,
             hand=(.20,-.86,1.13),yaw=0,pitch=.025,left=(-.64,.14,1.03),
             feet=(-.27,0,.18,.045),rollR=.22),'accelerate'),
    (20,dict(hip=(.005,-.14,-.15),twist=-.26,lean=.28,
             hand=(.18,-.83,1.08),yaw=-.07,pitch=0,left=(-.63,.12,1.01),
             feet=(-.27,0,.18,0)),'settle'),
    (25,dict(hip=(.035,-.02,-.14),twist=.36,lean=.16,
             hand=(.63,-.25,1.25),yaw=1.12,pitch=.25,left=(-.47,-.09,.93),
             feet=(-.14,0,.13,0)),'smooth'),
    (26,dict(hip=(-.035,-.07,-.14),twist=-.48,lean=.24,
             hand=(.13,-.70,1.10),yaw=-.55,pitch=.02,left=(-.67,.05,1.08),
             feet=(-.14,0,.13,.05),pivotR=-.65),'accelerate'),
    (29,dict(hip=(0,0,-.07),twist=-.25,lean=.12,
             hand=(.77,-.26,1.14),yaw=1.15,pitch=.08,left=(-.64,.03,1.02),
             feet=(-.08,.08,.05,.04),spin=-2.0),'linear'),
    (32,dict(hip=(0,0,-.045),twist=-.20,lean=.10,
             hand=(.80,-.25,1.15),yaw=1.10,pitch=.06,left=(-.66,.01,1.03),
             feet=(-.04,.055,.04,.10),spin=-4.5),'linear'),
    (35,dict(hip=(-.045,-.07,-.19),twist=-.60,lean=.28,bank=-.05,
             hand=(-.09,-.58,.91),yaw=-1.05,pitch=-.03,left=(-.62,.13,1.00),
             feet=(-.20,0,.14,0),spin=-math.tau),'settle'),
    (40,dict(hip=(-.02,-.04,-.14),twist=-.20,lean=.19,
             hand=(.30,-.44,1.08),yaw=.05,pitch=.22,left=(-.52,-.04,.96),
             feet=(-.18,0,.14,0),spin=-math.tau),'smooth'),
    (46,{**GUARD,'spin':-math.tau},'smooth')
]


def combo(frame):
    return sequence(KEYS,frame)


POWER = [(1,GUARD,'linear'),
         (2,{**KEYS[8][1],'hip':(0,-.19,-.18),'lean':.42,'hand':(.20,-.91,1.13)},'accelerate'),
         (5,{**KEYS[9][1],'hip':(0,-.15,-.20),'lean':.33},'settle'),
         (10,{**KEYS[10][1],'hip':(.03,-.03,-.14)},'smooth'),
         (16,GUARD,'smooth')]
DASH = [(1,GUARD,'linear'),
        (3,{**GUARD,'hip':(0,-.10,-.22),'lean':.52,'hand':(.59,.06,1.05),
            'yaw':1.95,'pitch':.27,'left':(-.47,.18,.92),'feet':(-.08,.045,.09,.045)},'settle'),
        (7,{**GUARD,'hip':(0,-.08,-.18),'lean':.40,'hand':(.60,.01,1.10),
            'yaw':1.80,'pitch':.30,'left':(-.49,.11,.91)},'linear'),
        (10,GUARD,'smooth')]

COMBO = [('Opening cut',1,9,2,'Recover1'),('Rising backhand',9,16,10,'Recover2'),
         ('Driving thrust',16,25,17,'Recover3'),('Spinning finisher',25,46,26,None)]

clips = {'Idle':(60,True,lambda f:idle((f-1)/60)),
         'Run':(16,True,lambda f:run((f-1)/16)),
         'AttackCombo':(46,False,combo),
         'Power':(16,False,lambda f:sequence(POWER,f)),
         'Dash':(10,False,lambda f:sequence(DASH,f)),
         'RunStart':(7,False,lambda f:mix(GUARD,run(0),smooth((f-1)/6))),
         'RunStop':(8,False,lambda f:mix(run(0),GUARD,smooth((f-1)/7)))}
for hit,frame in enumerate([9,16,25],1):
    clips[f'Recover{hit}']=(8,False,lambda f,frame=frame:mix(combo(frame),GUARD,smooth((f-1)/7)))
