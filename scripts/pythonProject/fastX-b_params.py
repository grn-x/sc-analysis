
"""CAR_WEIGHT = 2091
CAR_SPEED = 0.0

CRANE_BOOM_FRONT = 20
CRANE_BOOM_BACK = 5
CRANE_COUNTERWEIGHT = 4000

SPHERE_DIAMETER = 4
SPHERE_SPEED = 0.0
SPHERE_MATERIAL_DENSITY = 0.5
SPHERE_MASS = 4/3 * 3.14 * (SPHERE_DIAMETER / 2) ** 3"""


from math import pi, sqrt

# Given values
CAR_WEIGHT = 2091  # kg
CAR_SPEED = 30  # m/s
CRANE_BOOM_FRONT = 20  # meters from pivot to front
CRANE_BOOM_BACK = 5  # meters from pivot to counterweight
CRANE_COUNTERWEIGHT = 4000  # kg

SPHERE_DIAMETER = 4  # meters
SPHERE_SPEED = 15  # m/s
SPHERE_MATERIAL_DENSITY = 1.654  # g/cm^3, needs conversion
# convert density to kg/m^3
SPHERE_MATERIAL_DENSITY_KG_M3 = SPHERE_MATERIAL_DENSITY * 1000  # 0.5 g/cm³ = 500 kg/m³

# calculate sphere mass
SPHERE_RADIUS = SPHERE_DIAMETER / 2
SPHERE_VOLUME = (4 / 3) * pi * SPHERE_RADIUS ** 3
SPHERE_MASS = SPHERE_VOLUME * SPHERE_MATERIAL_DENSITY_KG_M3


# linear momentum of car
car_momentum = CAR_WEIGHT * CAR_SPEED

# angular impulse = r x p (assuming perpendicular hit at 90°)
angular_impulse_crane = CRANE_BOOM_FRONT * car_momentum  # in kg·m²/s


# L = r * m * v => v = L / (r * m)
counterweight_velocity = angular_impulse_crane / (CRANE_BOOM_BACK * CRANE_COUNTERWEIGHT)

# calculate momentum at impact of counterweight with sphere
counterweight_momentum = CRANE_COUNTERWEIGHT * counterweight_velocity

# Total momentum of the rolling sphere (linear)
sphere_momentum = SPHERE_MASS * SPHERE_SPEED


def pretty_print_results(sphere_mass, angular_impulse, counterweight_velocity, counterweight_momentum, sphere_momentum):
    def mps_to_kph(mps):
        return mps * 3.6

    print(f"{'Sphere Mass (kg):':35s} {sphere_mass:,.2f}")
    print(f"{'Angular Impulse on Crane (kg·m²/s):':35s} {angular_impulse:,.2f}")
    print(f"{'Counterweight Velocity:':35s} {counterweight_velocity:,.2f} m/s ({mps_to_kph(counterweight_velocity):.2f} km/h)")
    print(f"{'Counterweight Momentum (kg·m/s):':35s} {counterweight_momentum:,.2f}")
    print(f"{'Sphere Momentum (kg·m/s):':35s} {sphere_momentum:,.2f}")



"""print({
    "Sphere Mass (kg)": SPHERE_MASS,
    "\nAngular Impulse on Crane (kg·m²/s)": angular_impulse_crane,
    "\nCounterweight Velocity (m/s)": counterweight_velocity,
    "\nCounterweight Momentum (kg·m/s)": counterweight_momentum,
    "\nSphere Momentum (kg·m/s)": sphere_momentum,
})"""
pretty_print_results(
    SPHERE_MASS,
    angular_impulse_crane,
    counterweight_velocity,
    counterweight_momentum,
    sphere_momentum
)