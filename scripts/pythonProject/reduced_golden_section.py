import math

import matplotlib
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrowPatch
from matplotlib.animation import FuncAnimation
matplotlib.use('TkAgg')

#param
x_off = 108.0
y_off = -20.0
b = 15.0
alpha_0 = 3/5*math.pi  # start (rad), 0 = boom pointing down, angle between boom and y-axis
omega = 4.5  # direction counter-clockwise (rad/s)
v = 40  # (m/s)

# force custom angle, bypass numerical approximation of optimal theta
use_preset_phi = False       # use if true
preset_phi = math.radians(-2.48)

# utility funcs

def arm_position(t):
    """Position der Armspitze zur Zeit t"""
    alpha_t = alpha_0 + omega * t
    x = x_off + b * np.sin(alpha_t)
    y = y_off - b * np.cos(alpha_t)
    return x, y, alpha_t


def ball_position(t, phi):
    """Position der Kugel zur Zeit t bei Winkel phi"""
    x = v * t * np.cos(phi)
    y = v * t * np.sin(phi)
    return x, y


def find_t_for_phi(phi, max_iter=3):
    """Kollisionszeit t für gegebenen Winkel phi"""
    # Startwert: Distanz zum Pivot
    t = np.sqrt(x_off ** 2 + y_off ** 2) / v

    # Iterative
    for _ in range(max_iter):
        arm_x, arm_y, _ = arm_position(t)
        dist = np.sqrt(arm_x ** 2 + arm_y ** 2)
        t = dist / v

    return t


def error_function(phi):
    """Fehlerfunktion; Abstand zwischen Kugel und Armspitze"""
    t = find_t_for_phi(phi)

    ball_x, ball_y = ball_position(t, phi)
    arm_x, arm_y, alpha_t = arm_position(t)

    if not (np.pi / 2 <= alpha_t % (2 * np.pi) <= np.pi):
        return np.inf

    distance = np.sqrt((ball_x - arm_x) ** 2 + (ball_y - arm_y) ** 2)
    return distance


def golden_section_search(f, a, b, tol=0.01):
    phi_ratio = 0.618033988749895
    x1 = a + (1 - phi_ratio) * (b - a)
    x2 = a + phi_ratio * (b - a)
    f1 = f(x1)
    f2 = f(x2)

    iterations = 0
    while (b - a) > tol and iterations < 20:
        iterations += 1
        if f1 < f2:
            b, x2, f2 = x2, x1, f1
            x1 = a + (1 - phi_ratio) * (b - a)
            f1 = f(x1)
        else:
            a, x1, f1 = x1, x2, f2
            x2 = a + phi_ratio * (b - a)
            f2 = f(x2)

    result = x1 if f1 < f2 else x2
    min_error = f1 if f1 < f2 else f2
    return result, min_error, iterations



# calc interval
phi_left = np.arctan2(y_off, x_off + b)
phi_right = np.arctan2(y_off + b, x_off)


phi_min = min(phi_right, phi_left)
phi_max = max(phi_right, phi_left)

print(f"Drehpunkt: ({x_off:.2f}, {y_off:.2f})")
print(f"Armlänge: {b:.2f} m")
print(f"Winkelgeschwindigkeit: {omega:.2f} rad/s")
print(f"Kugelgeschwindigkeit: {v:.2f} m/s")
print(f"\nWinkelgrenzen für 'oberhalb':")
print(f"  phi_min = {np.degrees(phi_min):.2f}°")
print(f"  phi_max = {np.degrees(phi_max):.2f}°")
print()



if use_preset_phi:
    print("Winkelberechnung übersprungen")
    phi_optimal = preset_phi
    min_distance = error_function(phi_optimal)
    iters = 0
    print(f"Verwende festen Winkel: phi = {np.degrees(phi_optimal):.2f}°")
else:
    phi_optimal, min_distance, iters = golden_section_search(
        error_function, phi_min, phi_max, tol=0.01
    )

t_optimal = find_t_for_phi(phi_optimal)
ball_x_opt, ball_y_opt = ball_position(t_optimal, phi_optimal)
arm_x_opt, arm_y_opt, alpha_opt = arm_position(t_optimal)


print(f"Iterationen: {iters}")
print(f"Optimaler Winkel: φ = {np.degrees(phi_optimal):.2f}°")
print(f"Kollisionszeit: t = {t_optimal:.2f} s")
print(f"Minimaler Abstand: {min_distance:.4f} m")
print(f"Armwinkel bei Kollision: α = {np.degrees(alpha_opt):.2f}°")
print()

if min_distance < 0.1:
    print("Die Kugel trifft Armspitze.")
else:
    print("Kein Treffer; Beste Annhäherung: ")
print()


#vis, error func
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

phi_range = np.linspace(phi_min, phi_max, 100)
errors = [error_function(p) for p in phi_range]
errors = np.array(errors)
errors[errors > 10] = np.nan

ax1.plot(np.degrees(phi_range), errors, 'b-', linewidth=2, label='Abstand')
ax1.axvline(np.degrees(phi_optimal), color='r', linestyle='--',
            label=f'Optimum: {np.degrees(phi_optimal):.1f}°')
ax1.scatter([np.degrees(phi_optimal)], [min_distance],
            color='r', s=100, zorder=5)
ax1.set_xlabel('Winkel phi [°]', fontsize=12)
ax1.set_ylabel('Abstand Kugel-Armspitze [m]', fontsize=12)
ax1.set_title('Fehlerfunktion (Golden Section Search)', fontsize=13, fontweight='bold')
ax1.grid(True, alpha=0.3)
ax1.legend()

#vis 2 geometry
theta_circle = np.linspace(0, 2 * np.pi, 100)
circle_x = x_off + b * np.sin(theta_circle)
circle_y = y_off - b * np.cos(theta_circle)
ax2.plot(circle_x, circle_y, 'gray', linewidth=1, alpha=0.5, label='Arm-Kreis')

ax2.plot(x_off, y_off, 'ko', markersize=10, label='Drehpunkt', zorder=10)

ax2.plot(0, 0, 'go', markersize=10, label='Start (Kugel)', zorder=10)

ball_traj_x = np.linspace(0, ball_x_opt * 1.2, 100)
ball_traj_y = ball_traj_x * np.tan(phi_optimal)
ax2.plot(ball_traj_x, ball_traj_y, 'g--', linewidth=2, alpha=0.7, label='Kugelbahn')

ax2.plot([x_off, arm_x_opt], [y_off, arm_y_opt], 'b-', linewidth=3, label='Arm')
ax2.plot(arm_x_opt, arm_y_opt, 'bo', markersize=12, zorder=10)

ax2.plot(ball_x_opt, ball_y_opt, 'ro', markersize=12, label='Kugel (t={:.2f}s)'.format(t_optimal), zorder=10)

ax2.plot([ball_x_opt, arm_x_opt], [ball_y_opt, arm_y_opt],
         'r:', linewidth=2, label=f'Abstand: {min_distance:.3f}m')

alpha_above = np.linspace(np.pi / 2, np.pi, 50)

above_x = x_off + b * np.sin(alpha_above)
above_y = y_off - b * np.cos(alpha_above)
ax2.plot(above_x, above_y, 'orange', linewidth=4, alpha=0.6, label='Gültige Zone (oberhalb)')

ax2.axhline(y_off, color='gray', linestyle=':', linewidth=1, alpha=0.5)

ax2.set_xlabel('x [m]', fontsize=12)
ax2.set_ylabel('y [m]', fontsize=12)
ax2.set_title('Geometrie: Kugel vs. Kranarm', fontsize=13, fontweight='bold')
ax2.axis('equal')
ax2.grid(True, alpha=0.3)
ax2.legend(loc='upper left', fontsize=9)

plt.tight_layout()
plt.savefig('kollision_analyse.png', dpi=150, bbox_inches='tight')
print("Visualisierung gespeichert: kollision_analyse.png")

# anim

fig_anim, ax_anim = plt.subplots(figsize=(10, 10))

#ax_anim.set_xlim(-2, max(15, x_off + b + 3))
#ax_anim.set_ylim(-2, max(15, y_off + b + 3))
x_min = min(-2, x_off - b - 3)
x_max = max(2, x_off + b + 3)
y_min = min(y_off - b - 3, -10)
y_max = max(5, b + 3)
ax_anim.set_xlim(x_min, x_max)
ax_anim.set_ylim(y_min, y_max)

ax_anim.set_aspect('equal')
ax_anim.grid(True, alpha=0.3)
ax_anim.set_xlabel('x [m]', fontsize=12)
ax_anim.set_ylabel('y [m]', fontsize=12)
ax_anim.set_title('Animation: Kugel trifft Kranarm', fontsize=14, fontweight='bold')

ax_anim.plot(circle_x, circle_y, 'gray', linewidth=1, alpha=0.3)
ax_anim.plot(above_x, above_y, 'orange', linewidth=3, alpha=0.4, label='Gültige Zone')
ax_anim.plot(x_off, y_off, 'ko', markersize=10, zorder=10)
ax_anim.plot(0, 0, 'go', markersize=10, zorder=10)
ax_anim.axhline(y_off, color='gray', linestyle=':', linewidth=1, alpha=0.3)

arm_line, = ax_anim.plot([], [], 'b-', linewidth=3, label='Arm')
arm_tip = ax_anim.plot([], [], 'bo', markersize=12)[0]
ball_dot = ax_anim.plot([], [], 'ro', markersize=10, label='Kugel')[0]
ball_trail, = ax_anim.plot([], [], 'r-', linewidth=1, alpha=0.5)

time_text = ax_anim.text(0.02, 0.98, '', transform=ax_anim.transAxes,
                         fontsize=12, verticalalignment='top',
                         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

ax_anim.legend(loc='upper right')

t_max = t_optimal * 1.2
num_frames = 120
times = np.linspace(0, t_max, num_frames)
ball_trail_x, ball_trail_y = [], []


def init():
    arm_line.set_data([], [])
    arm_tip.set_data([], [])
    ball_dot.set_data([], [])
    ball_trail.set_data([], [])
    time_text.set_text('')
    return arm_line, arm_tip, ball_dot, ball_trail, time_text


def animate(frame):
    t = times[frame]


    arm_x, arm_y, alpha = arm_position(t)
    arm_line.set_data([x_off, arm_x], [y_off, arm_y])
    arm_tip.set_data([arm_x], [arm_y])


    if t <= t_optimal:
        ball_x, ball_y = ball_position(t, phi_optimal)
        ball_dot.set_data([ball_x], [ball_y])
        ball_trail_x.append(ball_x)
        ball_trail_y.append(ball_y)
        ball_trail.set_data(ball_trail_x, ball_trail_y)


    dist = np.sqrt((ball_x - arm_x) ** 2 + (ball_y - arm_y) ** 2) if t <= t_optimal else min_distance
    time_text.set_text(f't = {t:.2f}s\nα = {np.degrees(alpha):.1f}°\nAbstand = {dist:.3f}m')

    return arm_line, arm_tip, ball_dot, ball_trail, time_text


anim = FuncAnimation(fig_anim, animate, init_func=init,
                     frames=num_frames, interval=50, blit=True, repeat=True)

plt.tight_layout()
plt.show()