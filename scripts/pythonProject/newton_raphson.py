import math
import matplotlib
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Wedge
from matplotlib.animation import FuncAnimation

matplotlib.use('TkAgg')

# Standard Einheiten: Meter, Sekunden, Radiant

# ============================================================================
# PARAMETER
# ============================================================================
x_off = 50.0  # Pivot x-Position (alt)
y_off = -10.0  # Pivot y-Position (alt)
r = 15.0  # Armlänge (Kreisdradius)
alpha_0 = math.radians(45)#math.radians(80)#3 / 5 * np.pi  # Kran-Startwinkel im ALTEN System (rad)
omega = math.radians(0.1085956741481766)     # Winkelgeschwindigkeit (rad/s), positiv = gegen Uhrzeiger
v = 20  # Kugelgeschwindigkeit (m/s)
T_offset = 0.15  # Zeitverzögerung: Kran startet nach T_offset Sekunden

# Preset-Zeit (s) und Steuerflag
use_preset_time = False  # Wenn True, wird preset_T verwendet
preset_T = 1.5

        # ============================================================================
        # KOORDINATENTRANSFORMATION
        # ============================================================================

# Projektion auf neues Koordinatensystem:
# M (0, 0) Ursprung + Drehpunkt
# Kugel startet bei U = (u, 0) mit u < 0

# Distanz vom alten Ursprung (2 Koordinaten) zum Drehpunkt (länge)
u = -np.sqrt(x_off ** 2 + y_off ** 2)  # negativ, weil Kugel "links" vom Drehpunkt

# Transformiere Kran-Startwinkel ins neue System
# Im alten System: alpha_0 Winkel des Arms relativ zur Senkrechten
# Im neuen System: φ Winkel relativ zur positiven x-Achse
# Rotation des Koordinatensystems; Winkel der Diagonale (0,0) -> (x_off,y_off)
rotation_angle = np.arctan2(y_off, x_off)

""" TODO:
# Kran-Startwinkel im neuen System (φ-Koordinaten)
# Alte Position: (x_off + b*sin(alpha_0), y_off - b*cos(alpha_0))
# Umrechnung ins neue System
arm_x_old = x_off + r * np.sin(alpha_0)
arm_y_old = y_off - r * np.cos(alpha_0)
# Relativ zum Drehpunkt (neuer Ursprung)
arm_x_rel = arm_x_old - x_off
arm_y_rel = arm_y_old - y_off
# Rotiere um -rotation_angle
alpha_start = np.arctan2(arm_y_rel, arm_x_rel) - rotation_angle
"""

alpha_start = (math.pi/2 - alpha_0) - rotation_angle

print("=" * 80)
print("KOORDINATENTRANSFORMATION")
print("=" * 80)
print(f"Altes System - Kugel: (0, 0), Pivot: ({x_off:.2f}, {y_off:.2f})")
print(f"Neues System - Kugel: U = ({u:.2f}, 0), Pivot: M = (0, 0)")
print(f"Radius r = {r:.2f} m")
print(f"Rotationswinkel des Systems: {np.degrees(rotation_angle):.2f}°")
print(f"Kran-Startwinkel (neues System): α_start = {np.degrees(alpha_start):.2f}°")
print()

# Weitere Konfigurations-Flags
#separate_windows
#num_freeze_frames
#num_frames
#VISUALIZE_ITERATIONS
#SHOW_ITERATION_LABELS
#save_animation
# ============================================================================
# MATHEMATISCHE FUNKTIONEN (Neues System)
# ============================================================================

def h_theta(theta):
    """
    Streckenfunktion: Distanz zwischen Kugelursprung U und Schnittpunkt mit Kreissegment

    Parameter:
        theta: Startwinkel bei U (rad)

    Rückgabe:
        h: Distanz (m)

    Formel: h(θ) = -u*cos(θ) + sqrt(r² - u²*sin²(θ))
    """
    sin_theta = np.sin(theta)
    cos_theta = np.cos(theta)

    # Diskriminante prüfen (muss >= 0 sein)
    discriminant = r ** 2 - u ** 2 * sin_theta ** 2

    if discriminant < 0:
        #print(f"Warnung: Diskriminante < 0 für θ = {np.degrees(theta):.2f}°")
        return np.inf  # Kein Schnittpunkt mit Kreis

    h = -u * cos_theta + np.sqrt(discriminant)
    return h


def theta_from_T(T):
    """
    Umkehrfunktion h_theta: Berechne θ aus Flugzeit T (bzw Distanz [m], da h(θ)[m] = T*v [m]*[m/s])

    Parameter:
        T: Zeit (s)

    Rückgabe:
        theta: Winkel (rad)

    Formel: θ(T) = arccos(-(u² + T²v² - r²) / (2*u*Tv))
    """
    # guard clause; keine div durch null
    if T == 0 or np.isclose(T, 0):
        return np.nan

    # Argument für arccos
    arg = -(u ** 2 + (T * v) ** 2 - r ** 2) / (2 * u * T * v)

    # Prüfe ob im gültigen arccos Bereich [-1, 1];
    # Bedingung r² - u² * sin²(θ) >= 0, gelöst in https://de.wikipedia.org/wiki/Kosinussatz#SSS-Fall
    # Physikalisch: T ist noch zu kurz oder zu lang für gültigen θ, hat Kreis schon oder noch nicht geschnitten
    if arg < -1 or arg > 1:
        return np.nan  # Ungültig

    theta = np.arccos(arg)
    return theta


def P_kugel(theta):
    """
    Kugelposition P auf dem Kreissegment für gegebenes θ

    Parameter:
        theta: Startwinkel (rad)

    Rückgabe:
        x, y: Koordinaten im neuen/gedrehten System

    Formeln:
        x_k(θ) = h(θ)*cos(θ) + u (u negativ!)
        y_k(θ) = h(θ)*sin(θ)
    """
    h = h_theta(theta) # Distanz von U zum Kreis, gibt np.inf wenn kein Schnitt
    x = h * np.cos(theta) + u
    y = h * np.sin(theta)
    return x, y


def phi_kugel(T):
    """
    Kugelwinkel φ im inneren Kreissegment als Funktion der Zeit

    Parameter:
        T: Zeit (s)

    Rückgabe:
        phi: Winkel von M aus (rad), im Bereich [0, π/2]

    Verkettung:
        1. T -> θ(T)
        2. θ -> P(θ) = (x_k, y_k)
        3. (x_k, y_k) -> φ = arctan2(y_k, x_k)
    """
    theta = theta_from_T(T)

    if np.isnan(theta):
        return np.nan

    x, y = P_kugel(theta)

    # Winkel von M aus
    phi = np.arctan2(y, x)

    # Nur 1. Quadrant ist gültig [0, π/2]
    if phi < 0 or phi > np.pi / 2:
        return np.nan

    return phi


def phi_kran(T, skip_normalization=False):
    """
    Kranwinkel φ als Funktion der Zeit

    Parameter:
        T: Zeit (s)
        skip_normalization: Wenn True, wird die Modulo-Normalisierung übersprungen
                            Wird für das Plotting benötigt, wenn der Kranwinkel
                            0° (bei alpha_0 zwischen 116° und 117°) unterschreitet.
                            Parameter wird nur von der Plotfunktion verwendet.
    Rückgabe:
        phi: Winkel von M aus (rad)

    Formel:
        φ_kran(T) = α_start + ω*max(0, T - T_offset)

    Hinweis:
        - Für T < T_offset: Dom ist noch nicht mit Kran kollidiert; Kran steht still bei α_start
        - Für T >= T_offset: Kran dreht sich mit ω
        - ω > 0: gegen Uhrzeigersinn (φ steigt)
        - Der kleinstmögliche Winkel wird zurückgegeben, volle Umdrehung werden über den Modulo gestrichen

    """
    if T < T_offset:
        phi = alpha_start
    else:
        phi = alpha_start + omega * (T - T_offset)

    # Normalisiere auf [0, 2π[
    if not skip_normalization:
        phi = phi % (2 * np.pi)

    return phi


def delta_phi(T):
    """
    Differenzfunktion: Δφ(T) = φ_kugel(T) - φ_kran(T)

    Nullstellen dieser Funktion sind Kollisionszeitpunkte!

    Parameter:
        T: Zeit (s)

    Rückgabe:
        Differenz der Winkel (rad)

    Hinweis:
        - Wenn φ_kugel ungültig (außerhalb Kreissegment): return np.inf
        - Wenn φ_kran außerhalb [0, π/2]: anpassen (zyklisch)
    """
    phi_k = phi_kugel(T)
    phi_kr = phi_kran(T)

    if np.isnan(phi_k):
        return np.inf  # Kugel außerhalb gültigen Bereichs

    # Prüfe ob Kran im Kreissegment [0, π/2]
    # Falls nicht, ist keine Kollision möglich
    if phi_kr < 0 or phi_kr > np.pi / 2:
        return np.inf

    return phi_k - phi_kr


# ============================================================================
# GÜLTIGKEITSBEREICH BERECHNEN
# ============================================================================

# θ_min = 0° -> Kugel rollt horizontal
theta_min = 0.0
h_min = h_theta(theta_min)
if h_min != abs(u)+r:
    print("Warnung: Unerwartete h_min Berechnung!") # Sollte immer h_min = |u| + r sein

T_min = h_min / v

# θ_max = arctan(r / |u|) -> Kugel rollt zur oberen Ecke H = (0, r)
theta_max = np.arctan(r / abs(u))
h_max = h_theta(theta_max)
if h_max != np.sqrt(u**2 + r**2):
    print("Warnung: Unerwartete h_max Berechnung!")  # Sollte immer h_max = sqrt(u² + r²) sein
T_max = h_max / v

# φ-Grenzen im Kreissegment
phi_min = 0.0  # E = (r, 0)
phi_max = np.pi / 2  # H = (0, r)

print("=" * 80)
print("GÜLTIGKEITSBEREICH")
print("=" * 80)
print(f"θ_min = {np.degrees(theta_min):.2f}° -> h = {h_min:.2f}m -> T_min = {T_min:.4f}s")
print(f"θ_max = {np.degrees(theta_max):.2f}° -> h = {h_max:.2f}m -> T_max = {T_max:.4f}s")
print(f"Kreissegment: φ ∈ [{np.degrees(phi_min):.1f}°, {np.degrees(phi_max):.1f}°]") # 0° bis 90°
print()


# ============================================================================
# GUARD CLAUSE: Analytische Kollisionsprüfung
# ============================================================================

# Zeitfenster der Kugel (T_min kann > T_max sein; theta-Abhängigkeit)
T_check_min = min(T_min, T_max)
T_check_max = max(T_min, T_max)

print("=" * 80)
print("KOLLISIONSPRÜFUNG - Guard Clause")
print("=" * 80)
print(f"Zeitfenster der Kugel: [{T_check_min:.4f}s, {T_check_max:.4f}s]")
print(f"Kreissegment: [0°, 90°]")
print()

    # ----------------------------------------------------------------------------
    # Schritt 1: Effektive Rotationsdauer des Krans im Zeitfenster
    # ----------------------------------------------------------------------------

# Kran Rotationsbeginn:
#   T_offset > T_check_max: Kran rotiert gar nicht
#   T_offset < T_check_min: Kran rotiert bereits zu Beginn
#   Sonst: Kran startet bei T_offset
T_kran_start_effective = max(T_check_min, T_offset)

# Rotationsdauer im relevanten Zeitfenster
if T_kran_start_effective >= T_check_max:
    # noch nicht angefangen zu drehen
    rotation_duration = 0.0
    print("! Kran rotiert noch nicht (T_offset > Zeitfenster)")
else:
    rotation_duration = T_check_max - T_kran_start_effective

print(f"Kran rotiert von T={T_kran_start_effective:.4f}s bis T={T_check_max:.4f}s")
print(f"Effektive Rotationsdauer: {rotation_duration:.4f}s")

    # ----------------------------------------------------------------------------
    # Schritt 2: Winkelpositionen des Krans (ohne mod normalisierung)
    # ----------------------------------------------------------------------------

# Kranposition zu Beginn des Zeitfensters
# phi(T) = alpha_start + omega * max(0, T - T_offset)
phi_kran_start = alpha_start + omega * max(0, T_check_min - T_offset)

# Kranpos Ende Zeitfensters
phi_kran_end = alpha_start + omega * max(0, T_check_max - T_offset)

# Zurückgelegte Winkel (kann > 2π sein, weil keine Modulo Normalisierung)
delta_phi_kran = phi_kran_end - phi_kran_start

print(f"Kran-Startwinkel: φ_start = {np.degrees(phi_kran_start):.2f}° (unnormalisiert)")
print(f"Kran-Endwinkel: φ_end = {np.degrees(phi_kran_end):.2f}° (unnormalisiert)")
print(f"Zurückgelegter Winkel: Δφ = {np.degrees(delta_phi_kran):.2f}°")
print()

    # ----------------------------------------------------------------------------
    # Schritt 3: Prüfe ob Kran das Segment [0, π/2] durchläuft
    # ----------------------------------------------------------------------------

collision_possible = False

# Fall A: Mindestens eine volle Umdrehung
# Wenn |Δφ| >= π/2, dann durchläuft der Kran garantiert das 90°-Segment
if abs(delta_phi_kran) >= np.pi / 2:
    collision_possible = True
    print("^ Kran dreht sich mehr als 90° -> durchläuft Segment garantiert")

else:
    # Fall B: Kleine Rotation (< 90°)
    # Prüfe ob das Segment [0, π/2] zwischen phi_start und phi_end liegt

    # Normalisiere die Winkel auf [0, 2π[ für Vergleich
    phi_start_mod = phi_kran_start % (2 * np.pi)
    phi_end_mod = phi_kran_end % (2 * np.pi)

    segment_min = 0.0
    segment_max = np.pi / 2

    print(f"Kran normalisiert: {np.degrees(phi_start_mod):.2f}° -> {np.degrees(phi_end_mod):.2f}°")

    # Unterscheide Drehrichtung
    if omega >= 0:
        # Vorwärts (gegen Uhrzeigersinn): phi steigt
        if phi_start_mod <= phi_end_mod:
            # Kein Wrap-Around über 0°
            # Segment liegt zwischen start und end?
            if (phi_start_mod <= segment_max and phi_end_mod >= segment_min):
                collision_possible = True
                print("^ Segment liegt im Kranweg (direkt)")
        else:
            # Wrap-Around
            # Segment [0°, 90°] wird IMMER getroffen wenn Wrap-Around passiert
            collision_possible = True
            print("^ Kran geht über 0° -> trifft Segment")

    else:
        # Rückwärts (im Uhrzeigersinn)/ phi fällt
        if phi_end_mod <= phi_start_mod:
            # Normaler Rückwärtslauf
            if (phi_end_mod <= segment_max and phi_start_mod >= segment_min):
                collision_possible = True
                print("^ Segment liegt im Kranweg (rückwärts)")
        else:
            # Wrap-Around
            # Geht über 0° nach unten
            if segment_min <= phi_start_mod or segment_max >= phi_end_mod:
                collision_possible = True
                print("^ Kran geht rückwärts über 0° -> trifft Segment")

# ----------------------------------------------------------------------------
# Ergebnis
# ----------------------------------------------------------------------------

if not collision_possible:
    print("x Kollision UNMÖGLICH; Kran durchläuft Segment [0°, 90°] nicht während Kugel-Kreisschnittpunkten")
    print("Abbruch!")

else:
    print("^ Kollision MÖGLICH; Kran durchläuft Kreissegment im Zeitfenster")

print()

# ============================================================================
# NULLSTELLENSUCHE: Newton-Raphson mit Bisection-Fallback
# ============================================================================

def delta_phi_derivative(T, epsilon=1e-6):
    """
    Numerische Ableitung von Δφ(T); Finites Differenzenverfahren
    https://de.wikipedia.org/wiki/Numerische_Differentiation
    https://en.wikipedia.org/wiki/Finite_difference
    mit zentraler Differenz

    Parameter:
        T: Zeit (s)
        epsilon: Schrittweite für finite Differenzen

    Rückgabe:
        dΔφ/dT
    """
    return (delta_phi(T + epsilon) - delta_phi(T - epsilon)) / (2 * epsilon)

def newton_raphson(func, dfunc, T_initial, T_min_bound, T_max_bound, tol=1e-3, max_iter=20):
    """
    Newton-Raphson-Verfahren zur Nullstellensuche mit Sondermechanismen wegen des begrenzten Definitionsbereichs

     - Numerisch (=> Iterativ) Nullstellen einer funktion finden
     - Bildet Tangente per Ableitung am aktuellen Punkt
     - Nullstelle der Tangente liefert den nächsten Näherungswert
     - Bei gutem Startwert konvergiert das Verfahren quadratisch zur echten Nullstelle
     - Schlechte Startwerte können zu Divergenz führen!
                Daher Abbruchbedingungen und Fallback auf Bisection

        Ansatz: T_neu = T_alt - f(T_alt) / f'(T_alt)

    Parameter:
        func: Funktion (Δφ) (deren Nullstelle gesucht wird)
        dfunc: Ableitung von func
        T_initial: Startwert des Iterationsprozesses
        T_min_bound, T_max_bound: Gültigkeitsintervall
        tol: Toleranz/Fehlergrenze/Abbruchkriterium mir reichen 3 Nachkommastellen
        max_iter: Maximale Iterationen vor Abbruch


    Rückgabe:
        T_koll: Kollisionszeit (oder None)
        iterations: Anzahl Iterationen
        als Tuple (T_koll, iterations)


    Abbruchgründe:
        1. Erfolg: |f(T)| < tol -> Nullstelle gefunden!
        2. Fehler: f'(T) ≈ 0 -> horizontale Tangente; Division durch Null; Aufpassen bei Startwertwahl!
        3. Fehler: T_neu außerhalb [T_min, T_max] -> verlässt gültigen Bereich
        4. Fehler: max_iter erreicht -> keine Konvergenz

    Dann Rückfall auf langsameres (nicht quadratisch oder superlinear D: ) aber robusteres Bisection-Verfahren
    """
    T_current = T_initial

    for iteration in range(max_iter):
        # Werte der Funktion an aktueller Stelle
        function_value = func(T_current)

        # ABBRUCHBEDINGUNG 1: Nullstelle gefunden
        # wenn |f(T)| unterhalb der Toleranzschwelle (quasi null!)
        if abs(function_value) < tol:
            return T_current, iteration + 1

        # Ableitung an aktueller Stelle berechnen
        derivative_value = dfunc(T_current)

        # ABBRUCHBEDINGUNG 2: Horizontale Tangente
        # Wenn f'(T) ≈ 0, Division durch Null ^= Annähernd waagerechte Tangente: nächster Wert im "Unendlichen"
        if abs(derivative_value) < 1e-10:
            return None, iteration + 1

        # NEWTON-SCHRITT: nächsten Iterationspunkt
        # Schnittpunkt Tangente x-Achse
        # T_neu = T_alt - (Funktionswert / Steigung)
        T_next = T_current - function_value / derivative_value

        # ABBRUCHBEDINGUNG 3: Außerhalb des gültigen Bereichs
        if T_next < T_min_bound or T_next > T_max_bound:
            return None, iteration + 1

        # Update für nächste Iteration
        T_current = T_next

    # ABBRUCHBEDINGUNG 4: Iterationsgrenze erreicht :/ Worst Case; sehr schlechte Konvergenz, gleichzeitig aber viele Iterationen
    return None, max_iter


def bisection(func, T_left_start, T_right_start, tol=1e-3, max_iter=50):
    """
    Bisektionsmethode zur Nullstellensuche robuster als Newton-Raphson und garantiert Konvergenz sofern Vorzeichenwechsel existiert
    Allerdings deutlich langsamer (linear konvergent); Außerdem Problem bei z.B. Parabel mit doppelter Nullstelle, oder 2 Nullstellen im Intervall
    Meine Intervalle sind aber klein genug, und die Funktionen halt keine Parabeln, deswegen interessiert mich das nicht 😎👍
    Wird Nullstelle am algebraisch am aller äußersten Rand des definitionsbereichs wahrscheinlich nicht finden :/
    (Gemäß Zwischenwersatz: https://de.wikipedia.org/wiki/Zwischenwertsatz)


     - Numerisch (=> Iterativ) Nullstellen einer funktion finden
     - Falls Vorzeichenwechsel im Intervall [left, right] existiert, Intervall halbieren
     - Intervallhälfte mit Vorzeichenwechsel behalten
     - Voraussetzung: f(left) und f(right) haben unterschiedliche Vorzeichen
                Funktioniert auch bei schlechten Startwerten und ohne Ableitung

    Parameter:
        func: Funktion (Δφ) (deren Nullstelle gesucht wird)
        T_left_start, T_right_start: Grenzen des Start-Intervalls
        tol: Toleranz/Fehlergrenze/Abbruchkriterium mir reichen 3 Nachkommastellen
        max_iter: Maximale Anzahl Halbierungen

    Rückgabe:
        (T_nullstelle, anzahl_iterationen): Zeit der Nullstelle
        (None, 0): Falls kein Vorzeichenwechsel → keine Nullstelle

    Ablauf:
        1. Prüfe Vorzeichenwechsel: f(T_left) * f(T_right) < 0
        2. Berechne Mittelpunkt: T_mid = (T_left + T_right) / 2
        3. Evaluiere f(T_mid)
        4. Ersetze die Hälfte OHNE Vorzeichenwechsel
        5. Wiederhole bis |f(T_mid)| < tol, Intervall klein genug, oder max_iter erreicht

    Abbruchgründe:
    1. Erfolg: |f(T_mid)| < tol -> Nullstelle gefunden!
    2. Erfolg: (T_right - T_left)/2 < tol -> Intervall klein genug
    3. Fehler: max_iter erreicht Intervallmitte als beste Approximation zurückgeben

    """
    # Startwerte für linkes und rechtes Intervallende
    T_left = T_left_start
    T_right = T_right_start

    # Funktionswerte an den Intervallgrenzen
    f_left = func(T_left)
    f_right = func(T_right)

    # VORBEDINGUNG: Vorzeichenwechsel prüfen
    # In meinem Fall keine Nullstelle möglich
    if f_left * f_right > 0:
        return None, 0

    # ITERATION: Halbiere das Intervall wiederholt
    for iteration in range(max_iter):
        # Berechne Mittelpunkt des aktuellen Intervalls
        T_mid = (T_left + T_right) / 2

        # Funktionswert am Mittelpunkt
        f_mid = func(T_mid)

        # ABBRUCHBEDINGUNG 1: Nullstelle gefunden
        # Wenn |f(T_mid)| unterhalb der Toleranzschwelle (quasi null!)
        if abs(f_mid) < tol:
            return T_mid, iteration + 1

        # ABBRUCHBEDINGUNG 2: Intervall sehr klein
        interval_width = T_right - T_left
        if interval_width / 2 < tol:
            return T_mid, iteration + 1

        # INTERVALL-HALBIERUNG: Hälfte mit Vorzeichenwechsel behalten
        # Prüfen ob f_mid * f_left < 0 oder f_mid * f_right < 0
        if f_left * f_mid < 0:
            # Nullstelle liegt in linker Hälfte [T_left, T_mid]
            T_right = T_mid
            f_right = f_mid  # Rechte Hälfte ersetzen ^= Funktionswert updaten für nächste Iteration
        else:
            # Nullstelle liegt in rechter Hälfte [T_mid, T_right]
            T_left = T_mid
            f_left = f_mid  # Linke Hälfte ersetzen ^= Funktionswert updaten für nächste Iteration


    # ABBRUCHBEDINGUNG 3: Maximale Iterationen erreicht
    # Intervall-Mitte als bester Schätzwert
    return (T_left + T_right) / 2, max_iter


# ============================================================================
# AUSFÜHRUNG: Eigentliche Berechnung der Kollisionszeit T
# ============================================================================

if use_preset_time: # was macht das? TODO:
    print("=" * 80)
    print("VOREINGESTELLTER ZEITMODUS")
    print("=" * 80)
    T_optimal = preset_T
    min_error = abs(delta_phi(T_optimal))
    iters = 0
    method_used = "Preset"
    print(f"Verwende feste Zeit: T = {T_optimal:.4f}s")
elif collision_possible:
    T_lower = min(T_min, T_max)
    T_upper = max(T_min, T_max)
    # sollte doch eigentlich über T_min und T_max von vornherein definiert sein? TODO:

    # Startwert: Mitte des Intervalls
    T0 = (T_lower + T_upper) / 2

    # Versuch 1: Newton-Raphson
    T_optimal, iters_newton = newton_raphson(
        delta_phi, delta_phi_derivative, T0, T_lower, T_upper, tol=1e-6
    )

    if T_optimal is not None:
        method_used = "Newton-Raphson"
        min_error = abs(delta_phi(T_optimal))
        iters = iters_newton
    else:
        # Newton-Raphson fehlgeschlagen:
        # Bisection Fallback:
        # Vorzeichenwechsel im korrekten Intervall finden TODO: solve this without sampling
        T_samples = np.linspace(T_lower, T_upper, 100)
        delta_phi_samples = [delta_phi(t) for t in T_samples]

        # Vorzeichenwechsel-Paar finden TODO: solve this without sampling
        T_a, T_b = None, None
        for i in range(len(delta_phi_samples) - 1):
            if not np.isinf(delta_phi_samples[i]) and not np.isinf(delta_phi_samples[i + 1]):
                if delta_phi_samples[i] * delta_phi_samples[i + 1] < 0:
                    T_a = T_samples[i]
                    T_b = T_samples[i + 1]
                    break

        if T_a is not None:
            T_optimal, iters_bisection = bisection(delta_phi, T_a, T_b, tol=1e-6)
            method_used = "Bisection (Fallback)"
            min_error = abs(delta_phi(T_optimal)) if T_optimal else np.inf
            iters = iters_bisection
        else:
            T_optimal = None
            method_used = "None"
            min_error = np.inf
            iters = 0
else:
    T_optimal = None
    method_used = "Aborted (Guard Clause)"
    min_error = np.inf
    iters = 0

    # ============================================================================
    # ERGEBNISSE AUSGEBEN
    # ============================================================================

print("=" * 80)
print("NUMERISCHES ERGEBNIS")
print("=" * 80)
print(f"Methode: {method_used}")
print(f"Iterationen: {iters}")

if T_optimal is not None and not np.isinf(min_error):
    theta_opt = theta_from_T(T_optimal)
    phi_k_opt = phi_kugel(T_optimal)
    phi_kr_opt = phi_kran(T_optimal)
    x_opt, y_opt = P_kugel(theta_opt)

    print(f"Kollisionszeit: T = {T_optimal:.4f}s")
    print(f"Kugelwinkel θ: {np.degrees(theta_opt):.2f}°")
    print(f"Kugelposition φ: {np.degrees(phi_k_opt):.2f}°")
    print(f"Kranposition φ: {np.degrees(phi_kr_opt):.2f}°")
    print(f"Winkeldifferenz: {np.degrees(min_error):.4f}°")
    print(f"Position: P = ({x_opt:.2f}, {y_opt:.2f})")

    if min_error < np.radians(1):  # < 1° Differenz; willkürliche Schwelle
        print("\n^ TREFFER! Kugel trifft Kranarm.")
        success = 1
    else:
        print("\nx Kein exakter Treffer, aber beste Annäherung.")
        success = 0
else:
    print("x Keine Kollision gefunden!")
    T_optimal = T_min  # Für Visualisierung
    theta_opt = theta_min
    phi_k_opt = phi_kugel(T_optimal)
    phi_kr_opt = phi_kran(T_optimal)
    x_opt, y_opt = P_kugel(theta_opt)
    success = -1

print()

# ============================================================================
# VISUALISIERUNG 2x2 Tabelle
# ============================================================================

separate_windows = False  # Set to True for separate plot windows

if separate_windows:
    fig1, ax1 = plt.subplots(figsize=(8, 7))
    fig2, ax2 = plt.subplots(figsize=(8, 7))
    fig3, ax3 = plt.subplots(figsize=(8, 7))
    fig4, ax4 = plt.subplots(figsize=(8, 7))
else:
    fig, axes = plt.subplots(2, 2, figsize=(16, 14))
    ax1, ax2, ax3, ax4 = axes.flatten()

# ============================================================================
# PLOT 1 FEHLERFUNKTION Δφ(T) (oben links)
# ============================================================================

T_lower = min(T_min, T_max)
T_upper = max(T_min, T_max)
T_range = np.linspace(T_lower, T_upper, 200)
delta_phi_values = [delta_phi(t) for t in T_range]
delta_phi_values = np.array(delta_phi_values)

delta_phi_deg = np.degrees(delta_phi_values)
delta_phi_deg[np.isinf(delta_phi_deg)] = np.nan


ax1.plot(T_range, delta_phi_deg, 'b-', linewidth=2, label='Δφ(T) = φ_kugel - φ_kran')
ax1.axhline(0, color='gray', linestyle='--', linewidth=1, alpha=0.5)

if T_optimal is not None and not np.isinf(min_error):
    ax1.axvline(T_optimal, color='r', linestyle='--',
                label=f'Kollision: T={T_optimal:.3f}s')
    ax1.scatter([T_optimal], [np.degrees(min_error)],
                color='r', s=100, zorder=5)

ax1.set_xlabel('Zeit T [s]', fontsize=12)
ax1.set_ylabel('Winkeldifferenz Δφ [°]', fontsize=12)
ax1.set_title(f'Nullstellensuche ({method_used})', fontsize=13, fontweight='bold')
ax1.grid(True, alpha=0.3)
ax1.legend()

# ============================================================================
# PLOT 2 GEOMETRIE + KOLLISION (Rotiertes System) (oben rechts)
# ============================================================================

# Kreissegment (1. Quadrant)
theta_segment = np.linspace(0, np.pi / 2, 100)
segment_x = r * np.cos(theta_segment)
segment_y = r * np.sin(theta_segment)
ax2.plot(segment_x, segment_y, 'orange', linewidth=4, alpha=0.6, label='Kreissegment (Treffzone)')

# Vollständiger Kreis (grau)
theta_circle = np.linspace(0, 2 * np.pi, 200)
circle_x = r * np.cos(theta_circle)
circle_y = r * np.sin(theta_circle)
ax2.plot(circle_x, circle_y, 'gray', linewidth=1, alpha=0.3, linestyle='--')

# Dreh-/Mittelpunkt M = (0, 0)
ax2.plot(0, 0, 'ko', markersize=12, label='M (Pivot)', zorder=10)

# Kugel-Startpunkt U = (u, 0)
ax2.plot(u, 0, 'go', markersize=12, label=f'U (Kugel-Start, u={u:.1f})', zorder=10)

# Kugelbahn zur optimalen Zeit
if not np.isinf(min_error):
    ball_traj_x = [u, x_opt]
    ball_traj_y = [0, y_opt]
    ax2.plot(ball_traj_x, ball_traj_y, 'g--', linewidth=2, alpha=0.7, label='Kugelbahn')
    ax2.plot(x_opt, y_opt, 'ro', markersize=12, label=f'Kugel (T={T_optimal:.3f}s)', zorder=10)

    # Kranarm zur optimalen Zeit
    arm_x_opt = r * np.cos(phi_kr_opt)
    arm_y_opt = r * np.sin(phi_kr_opt)
    ax2.plot([0, arm_x_opt], [0, arm_y_opt], 'b-', linewidth=3, label='Kranarm')
    ax2.plot(arm_x_opt, arm_y_opt, 'bo', markersize=12, zorder=10)

    ax2.plot([x_opt, arm_x_opt], [y_opt, arm_y_opt],
             'r:', linewidth=2, label=f'Abstand: {np.degrees(min_error):.3f}°')

ax2.axhline(0, color='k', linewidth=0.5)
ax2.axvline(0, color='k', linewidth=0.5)

ax2.set_xlabel('x [m]', fontsize=12)
ax2.set_ylabel('y [m]', fontsize=12)
ax2.set_title('Geometrie (Rotiertes Koordinatensystem)', fontsize=13, fontweight='bold')
ax2.axis('equal')
ax2.grid(True, alpha=0.3)
ax2.legend(loc='best', fontsize=9)

margin = 5
ax2.set_xlim(u - margin, r + margin)
ax2.set_ylim(-margin, r + margin)

# ============================================================================
# PLOT 3 WINKELFUNKTIONEN (unten links)
# ============================================================================

# Zeitbereich 0 bis T_max + Buffer
T_plot_start = 0.0
T_plot_end = max(T_min, T_max) * 1.1
T_func_range = np.linspace(T_plot_start, T_plot_end, 300)

"""# phi_kugel(T) nur im gültigen Bereich
phi_kugel_values = np.array([phi_kugel(t) for t in T_func_range])
phi_kugel_values[np.isnan(phi_kugel_values)] = np.nan
"""

# phi_kugel(T) über gesamten Zeitbereich
phi_kugel_values = np.array([phi_kugel(t) for t in T_func_range])


# phi_kran(T) über gesamten Zeitbereich
phi_kran_values = np.array([phi_kran(t, True) for t in T_func_range])

# theta(T) Abschusswinkel der Kugel
theta_from_T_values = np.array([theta_from_T(t) for t in T_func_range])
theta_from_T_values[np.isnan(theta_from_T_values)] = np.nan

# Winkelfunktionen
ax3.plot(T_func_range, np.degrees(phi_kugel_values), 'orange',
         linewidth=2.5, label='φ_kugel(T) - Position auf Kreissegment', alpha=0.85)
ax3.plot(T_func_range, np.degrees(phi_kran_values), 'blue',
         linewidth=2.5, label='φ_kran(T) - Kranarm-Position', alpha=0.85)
ax3.plot(T_func_range, np.degrees(theta_from_T_values), 'green',
         linewidth=2, label='θ(T) - Abschusswinkel der Kugel', alpha=0.7)#, linestyle='--')

# Markiere Kreissegment-Grenzen (0° - 90°)
ax3.axhline(0, color='black', linestyle=':', linewidth=1.5, alpha=1)
ax3.axhline(90, color='black', linestyle=':', linewidth=1.5, alpha=1,
            label='Kreissegment-Grenzen (0°-90°)')

# Zeitmarker T_min
ax3.axvline(T_min, color='gray', linestyle='--', linewidth=1.5,
            alpha=0.5, label=f'T_min = {T_min:.3f}s')

# Zeitmarker T_max
ax3.axvline(T_max, color='gray', linestyle='--', linewidth=1.5,
            alpha=0.5, label=f'T_max = {T_max:.3f}s')

# Zeitmarker T_offset für Kran, nur wenn > 0 (=aktiv)
if T_offset > 0:
    ax3.axvline(T_offset, color='blue', linestyle='--', linewidth=1.5,
                alpha=0.6, label=f'T_offset = {T_offset:.3f}s (Kran startet)')

# Zeitmarker T_optimal ^= Kollision
if T_optimal is not None and not np.isinf(min_error):
    ax3.axvline(T_optimal, color='red', linestyle='--', linewidth=2,
                alpha=0.7, label=f'T_optimal = {T_optimal:.3f}s (Kollision)')
    ax3.scatter([T_optimal], [np.degrees(phi_k_opt)], color='red', s=100,
                zorder=5, marker='o', edgecolors='darkred', linewidths=2)
    ax3.scatter([T_optimal], [np.degrees(phi_kr_opt)], color='red', s=100,
                zorder=5, marker='o', edgecolors='darkred', linewidths=2)

ax3.set_xlabel('Zeit T [s]', fontsize=12)
ax3.set_ylabel('Winkel [°]', fontsize=12)
ax3.set_title('Winkelfunktionen über Zeit', fontsize=13, fontweight='bold')
ax3.grid(True, alpha=0.3)
ax3.legend(loc='best', fontsize=8)
ax3.set_xlim(T_plot_start, T_plot_end)
ax3.set_ylim(-10, 100)  # Fokus auf 0°-90° Bereich mit Buffer

# ============================================================================
# PLOT 4 ORIGINAL-KOORDINATENSYSTEM (unten rechts)
# ============================================================================

# Rotation um -abs(rotation_angle) Rückübertragung auf originale Ausrichtung
def rotate_back(x, y):
    """Rotiere Punkt (x,y) vom gedrehten System zurück ins Original"""
    abs_angle = abs(rotation_angle)
    cos_r = np.cos(-abs_angle)
    sin_r = np.sin(-abs_angle)
    x_rot = x * cos_r - y * sin_r
    y_rot = x * sin_r + y * cos_r
    # Zum ursprünglichen Offset zurückverschieben
    x_orig = x_rot + x_off
    y_orig = y_rot + y_off
    return x_orig, y_orig


# Kreissegment zurück rotieren
segment_x_orig, segment_y_orig = rotate_back(segment_x, segment_y)
circle_x_orig, circle_y_orig = rotate_back(circle_x, circle_y)

ax4.plot(segment_x_orig, segment_y_orig, 'orange', linewidth=4, alpha=0.6,
         label='Kreissegment')
ax4.plot(circle_x_orig, circle_y_orig, 'gray', linewidth=1, alpha=0.3, linestyle='--')

# Drehpunkt
ax4.plot(x_off, y_off, 'ko', markersize=12, label=f'Pivot ({x_off:.1f}, {y_off:.1f})', zorder=10)

# Kugel-Start (0, 0) im ursprünglichen-System
ax4.plot(0, 0, 'go', markersize=12, label='Kugel-Start (0, 0)', zorder=10)

# Achsenlinien zu x_off und y_off
ax4.axhline(y_off, color='k', linewidth=0.5, linestyle=':', alpha=0.5)
ax4.axvline(x_off, color='k', linewidth=0.5, linestyle=':', alpha=0.5)
ax4.axhline(0, color='k', linewidth=0.5)
ax4.axvline(0, color='k', linewidth=0.5)

# Verbindungslinie Kugel -> Pivot
ax4.plot([0, x_off], [0, y_off], 'gray', linewidth=2, linestyle='--',
         alpha=0.4, label=f'Distanz: {abs(u):.2f}m')

# Kollisionspunkt und Kranarm zurück rotieren
if not np.isinf(min_error):
    # Kugelbahn
    ball_x_orig, ball_y_orig = rotate_back(x_opt, y_opt)
    ax4.plot([0, ball_x_orig], [0, ball_y_orig], 'g--', linewidth=2,
             alpha=0.7, label='Kugelbahn')
    ax4.plot(ball_x_orig, ball_y_orig, 'ro', markersize=12,
             label=f'Kollision (T={T_optimal:.3f}s)', zorder=10)

    # Kranarm
    arm_x_orig, arm_y_orig = rotate_back(arm_x_opt, arm_y_opt)
    ax4.plot([x_off, arm_x_orig], [y_off, arm_y_orig], 'b-', linewidth=3, label='Kranarm')
    ax4.plot(arm_x_orig, arm_y_orig, 'bo', markersize=12, zorder=10)

    # Abstandslinie
    ax4.plot([ball_x_orig, arm_x_orig], [ball_y_orig, arm_y_orig],
             'r:', linewidth=2, alpha=0.6)

ax4.set_xlabel('x [m]', fontsize=12)
ax4.set_ylabel('y [m]', fontsize=12)
ax4.set_title('Original-Koordinatensystem', fontsize=13, fontweight='bold')
ax4.axis('equal')
ax4.grid(True, alpha=0.3)
ax4.legend(loc='best', fontsize=9)

# Grenzen anpassen
margin_orig = 6
x_min_orig = min(-margin_orig, x_off - r - margin_orig, 0)
x_max_orig = max(x_off + r + margin_orig, margin_orig)
y_min_orig = min(y_off - r - margin_orig, -margin_orig, 0)
y_max_orig = max(y_off + r + margin_orig, margin_orig, 0)

ax4.set_xlim(x_min_orig, x_max_orig)
ax4.set_ylim(y_min_orig, y_max_orig)

if not separate_windows:
    plt.tight_layout()
plt.show()
# ============================================================================
# ANIMATION
# ============================================================================

save_animation=False

fig_anim, ax_anim = plt.subplots(figsize=(10, 10))

# Setup
margin_anim = 8
ax_anim.set_xlim(u - margin_anim, r + margin_anim)
ax_anim.set_ylim(-margin_anim, r + margin_anim)
ax_anim.set_aspect('equal')
ax_anim.grid(True, alpha=0.3)
ax_anim.set_xlabel('x [m]', fontsize=12)
ax_anim.set_ylabel('y [m]', fontsize=12)
ax_anim.set_title('Animation: Kugel auf Kranarm (Rotiertes System)', fontsize=14, fontweight='bold')

# Statische Elemente
ax_anim.plot(circle_x, circle_y, 'gray', linewidth=1, alpha=0.2, linestyle='--')
ax_anim.plot(segment_x, segment_y, 'orange', linewidth=4, alpha=0.4, label='Kreissegment')
ax_anim.plot(0, 0, 'ko', markersize=12, zorder=10)
ax_anim.plot(u, 0, 'go', markersize=12, zorder=10)
ax_anim.axhline(0, color='k', linewidth=0.5)
ax_anim.axvline(0, color='k', linewidth=0.5)

# Dynamische Elemente
arm_line, = ax_anim.plot([], [], 'b-', linewidth=3, label='Kranarm')
arm_tip = ax_anim.plot([], [], 'bo', markersize=12)[0]
ball_dot = ax_anim.plot([], [], 'ro', markersize=10, label='Kugel-Kreisbahn θ(T)')[0]
ball_dot.set_color('orange')
ball_dot.set_alpha(0.3)
ball_trail, = ax_anim.plot([], [], 'r-', linewidth=1, alpha=0.5)

ball_dot_linear, = ax_anim.plot([], [], 'ro', markersize=10, label='Kugel auf gerader Bahn')
ball_trail_distance, = ax_anim.plot([], [], 'g--', linewidth=2, alpha=0.8, label='Geradliniger Flug')
time_text = ax_anim.text(0.02, 0.98, '', transform=ax_anim.transAxes,
                         fontsize=12, verticalalignment='top',
                         bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

ax_anim.legend(loc='upper right')

# Zeitarray mit Freeze-Frames erstellen
if T_optimal is not None and not np.isinf(min_error):
    t_anim_end = max(T_optimal * 1.3, T_offset + 0.5)
else:
    T_lower_anim = min(T_min, T_max)
    T_upper_anim = max(T_min, T_max)
    t_anim_end = max(T_upper_anim * 1.2, T_offset + 1.0)

num_frames = 150
num_freeze_frames = 20

# Zeitarray mit eingefügten Freeze-Frames
# Frames proportional zur Zeitspanne verteilen
duration_before = T_optimal
duration_after = t_anim_end - T_optimal
total_duration = t_anim_end

# Frames proportional verteilen (ohne Freeze-Frames)
frames_before = int(num_frames * duration_before / total_duration)
frames_after = num_frames - frames_before

times_before = np.linspace(0, T_optimal, frames_before)
times_freeze = np.full(num_freeze_frames, T_optimal)  # T_optimal wiederholen ^= Animation pausieren
times_after = np.linspace(T_optimal, t_anim_end, frames_after)
times = np.concatenate([times_before, times_freeze, times_after])

ball_trail_x, ball_trail_y = [], []


def init():
    arm_line.set_data([], [])
    arm_tip.set_data([], [])
    ball_dot.set_data([], [])
    ball_trail.set_data([], [])
    ball_dot_linear.set_data([], [])
    ball_trail_distance.set_data([], [])
    time_text.set_text('')
    return arm_line, arm_tip, ball_dot, ball_trail, ball_dot_linear, ball_trail_distance, time_text


def animate(frame):
    t = times[frame]

    # Kranarm
    phi_kr = phi_kran(t)
    arm_x = r * np.cos(phi_kr)
    arm_y = r * np.sin(phi_kr)
    arm_line.set_data([0, arm_x], [0, arm_y])
    arm_tip.set_data([arm_x], [arm_y])

    # Kugel (nur im gültigen Zeitbereich)
    ball_x, ball_y = None, None
    delta = np.inf
    phi_k_deg = None

    if T_min <= t <= T_max or T_max <= t <= T_min:
        theta_t = theta_from_T(t)
        if not np.isnan(theta_t):
            ball_x, ball_y = P_kugel(theta_t)
            ball_dot.set_data([ball_x], [ball_y])

            # Berechne Winkeldifferenz
            phi_k = phi_kugel(t)
            if not np.isnan(phi_k):
                delta = np.degrees(abs(phi_k - phi_kr))
                phi_k_deg = np.degrees(phi_k)
    else:
        ball_dot.set_data([], [])

    # Kugelbahn zeichnen (geradlinige Bewegung)
    if t <= T_optimal:
        x_lin = u + v * np.cos(theta_opt) * t
        y_lin = v * np.sin(theta_opt) * t
        ball_dot_linear.set_data([x_lin], [y_lin])
        ball_trail_distance.set_data([u, x_lin], [0, y_lin])
    else:
        # Nach T_optimal: Endposition halten
        x_lin = u + v * np.cos(theta_opt) * T_optimal
        y_lin = v * np.sin(theta_opt) * T_optimal
        ball_dot_linear.set_data([x_lin], [y_lin])
        ball_trail_distance.set_data([u, x_lin], [0, y_lin])

    # Text-Anzeige
    delta_str = f'{delta:.2f}°' if not np.isinf(delta) else 'N/A'
    phi_k_str = f'{phi_k_deg:.1f}°' if phi_k_deg is not None else 'N/A'
    time_text.set_text(f'T = {t:.3f}s\nφ_kran(T) = {np.degrees(phi_kr):.1f}°\nφ_kugel(T) = {phi_k_str}\nΔφ(T) = {delta_str}')

    return arm_line, arm_tip, ball_dot, ball_trail, ball_dot_linear, ball_trail_distance, time_text


anim = FuncAnimation(fig_anim, animate, init_func=init,
                     frames=len(times), interval=50, blit=True, repeat=True)

plt.tight_layout()
plt.show()
if(save_animation):
    anim.save("kugel_kran_animation.gif", writer='pillow', fps=25)

# ============================================================================
# VISUALISIERUNG DER ITERATIONSVERFAHREN (TODO: Implement)
# ============================================================================

def newton_raphson_visualized(func, dfunc, T_initial, T_min_bound, T_max_bound,
                              ax, tol=1e-3, max_iter=20, show_labels=False):
    """
    Newton-Raphson mit visueller Darstellung der Iterationsschritte

        Tangenten an jedem Iterationspunkt
        Vertikale Linien von Nullstelle Tangente zur Funktion
                mit entsprechendem nächsten Ausgangspunkt
    """
    T_current = T_initial
    iteration_data = []  # Iterationsschritte eintragen

    for iteration in range(max_iter):
        function_value = func(T_current)

        # Iterationsschritt anhängen
        iteration_data.append({
            'T': T_current,
            'f_T': function_value,
            'iteration': iteration
        })

        # ABBRUCH 1: Nullstelle gefunden
        if abs(function_value) < tol:
            # Visualisiere alle gesammelten Schritte
            visualize_newton_steps(ax, func, dfunc, iteration_data, T_min_bound, T_max_bound, show_labels)
            return T_current, iteration + 1

        derivative_value = dfunc(T_current)

        # ABBRUCH 2: Horizontale Tangente
        if abs(derivative_value) < 1e-10:
            visualize_newton_steps(ax, func, dfunc, iteration_data, T_min_bound, T_max_bound, show_labels)
            return None, iteration + 1

        # Newton-Schritt
        T_next = T_current - function_value / derivative_value

        # ABBRUCH 3: Außerhalb Bereich
        if T_next < T_min_bound or T_next > T_max_bound:
            visualize_newton_steps(ax, func, dfunc, iteration_data, T_min_bound, T_max_bound, show_labels)
            return None, iteration + 1

        T_current = T_next

    # ABBRUCH 4: Max Iterationen
    visualize_newton_steps(ax, func, dfunc, iteration_data, T_min_bound, T_max_bound, show_labels)
    return None, max_iter


def visualize_newton_steps(ax, func, dfunc, iteration_data, T_min, T_max, show_labels):
    """Zeichnet die Newton-Raphson Iterationsschritte"""
    # Durch 5 unterschiedliche Farben für Tangenten und Punkte cyclen
    color_palette = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00']  # Rot, Blau, Grün, Lila, Orange
    colors = [color_palette[i % len(color_palette)] for i in range(len(iteration_data))]

    for i, step in enumerate(iteration_data):
        T_curr = step['T']
        f_curr = step['f_T']
        df_curr = dfunc(T_curr)

        # Punkt auf Funktion
        ax.scatter([T_curr], [np.degrees(f_curr)], color=colors[i], s=80,
                   zorder=100, edgecolors='black', linewidths=1.5,
                   label=f'Iteration {i}' if show_labels else '')

        # Tangente zeichnen; Steigung = df_curr
        # y - f_curr = df_curr * (x - T_curr)
        # y = df_curr * (x - T_curr) + f_curr
        T_range = np.linspace(T_min, T_max, 100)
        tangent = df_curr * (T_range - T_curr) + f_curr
        ax.plot(T_range, np.degrees(tangent), color=colors[i],
                linewidth=1.5, alpha=1, linestyle='-', zorder=50)

        # Nullstelle Tangente
        if abs(df_curr) > 1e-10:
            T_zero = T_curr - f_curr / df_curr
            if T_min <= T_zero <= T_max:
                # Vertikale Linie von Nullstelle zur x-Achse
                ax.plot([T_zero, T_zero], [0, 0], 'o', color=colors[i],
                        markersize=6, alpha=0.6, zorder=90)
                # Vertikale Linie zur Funktion für nächste Iteration
                if i < len(iteration_data) - 1:
                    ax.plot([T_zero, T_zero], [0, np.degrees(func(T_zero))],
                            color=colors[i], linewidth=1, alpha=0.4,
                            linestyle=':', zorder=80)


def bisection_visualized(func, T_left_start, T_right_start, ax,
                         tol=1e-3, max_iter=50, show_labels=False):
    """
    Bisection mit visueller Darstellung der Intervallhalbierungen


    Grüne transparente Bereiche für aktuelle Intervalle
    Horizontale Linien an Intervallgrenzen
    Schnittpunkte von Intervallgrenzen und Funktion mit Vorzeichen
    """
    T_left = T_left_start
    T_right = T_right_start

    f_left = func(T_left)
    f_right = func(T_right)

    iteration_data = []  # Intervalle speichern

    # VORBEDINGUNG: Vorzeichenwechsel
    if f_left * f_right > 0:
        return None, 0

    for iteration in range(max_iter):
        T_mid = (T_left + T_right) / 2
        f_mid = func(T_mid)

        # Intervalldaten für Visualisierung
        iteration_data.append({
            'T_left': T_left,
            'T_right': T_right,
            'T_mid': T_mid,
            'f_left': f_left,
            'f_right': f_right,
            'f_mid': f_mid,
            'iteration': iteration
        })

        # ABBRUCH 1: Nullstelle gefunden
        if abs(f_mid) < tol:
            visualize_bisection_steps(ax, iteration_data, show_labels)
            return T_mid, iteration + 1

        # ABBRUCH 2: Intervall klein genug
        if (T_right - T_left) / 2 < tol:
            visualize_bisection_steps(ax, iteration_data, show_labels)
            return T_mid, iteration + 1

        # Intervall halbieren
        if f_left * f_mid < 0:
            T_right = T_mid
            f_right = f_mid
        else:
            T_left = T_mid
            f_left = f_mid

    # ABBRUCH 3: Max Iterationen
    visualize_bisection_steps(ax, iteration_data, show_labels)
    return (T_left + T_right) / 2, max_iter


def visualize_bisection_steps(ax, iteration_data, show_labels):
    """Zeichnet die Bisection Iterationsschritte"""
    colors = plt.cm.viridis(np.linspace(0.2, 0.9, len(iteration_data)))

    # y-Limits für horizontale Linien
    y_min, y_max = ax.get_ylim()
    line_length = (y_max - y_min) * 0.05  # 5% der Höhe

    for i, step in enumerate(iteration_data):
        T_left = step['T_left']
        T_right = step['T_right']
        T_mid = step['T_mid']
        f_left = step['f_left']
        f_right = step['f_right']
        f_mid = step['f_mid']

        # aktuelles Intervall grün schattieren
        ax.axvspan(T_left, T_right, color='green', alpha=0.05, zorder=10)

        # Horizontale Linien an Intervallgrenzen
        y_pos = y_max - (i + 1) * line_length * 1.2
        ax.plot([T_left, T_right], [y_pos, y_pos],
                color=colors[i], linewidth=2, alpha=0.6, zorder=120,
                label=f'Intervall {i}' if show_labels else '')

        # Intervallgrenzen / Punkte mit Vorzeichen
        # Links
        sign_left = '+' if f_left > 0 else '-'
        ax.scatter([T_left], [np.degrees(f_left)], color=colors[i],
                   s=100, marker='o', zorder=130, edgecolors='black', linewidths=1.5)
        ax.text(T_left, np.degrees(f_left) + 2, sign_left,
                fontsize=10, ha='center', va='bottom', fontweight='bold',
                color=colors[i], zorder=140)

        # Rechts
        sign_right = '+' if f_right > 0 else '-'
        ax.scatter([T_right], [np.degrees(f_right)], color=colors[i],
                   s=100, marker='o', zorder=130, edgecolors='black', linewidths=1.5)
        ax.text(T_right, np.degrees(f_right) + 2, sign_right,
                fontsize=10, ha='center', va='bottom', fontweight='bold',
                color=colors[i], zorder=140)

        # Mittelpunkt
        ax.scatter([T_mid], [np.degrees(f_mid)], color=colors[i],
                   s=80, marker='x', zorder=130, linewidths=2)


# ============================================================================
# VISUALISIERUNG ITERATIONSVERFAHREN
# ============================================================================

# Control Flags
SHOW_ITERATION_LABELS = True  # True für Labels
VISUALIZE_ITERATIONS = True  # False für Plot ohne Iteration

# Neuer Plot mit Visualisierung
fig_iter, ax_iter = plt.subplots(figsize=(14, 8))

# Plot Differenzfunktion
T_lower = min(T_min, T_max)
T_upper = max(T_min, T_max)
T_range = np.linspace(T_lower, T_upper, 200)
delta_phi_values = [delta_phi(t) for t in T_range]
delta_phi_values = np.array(delta_phi_values)

delta_phi_deg = np.degrees(delta_phi_values)
delta_phi_deg[np.isinf(delta_phi_deg)] = np.nan

ax_iter.plot(T_range, delta_phi_deg, 'b-', linewidth=3,
             label='Δφ(T) = φ_kugel - φ_kran', zorder=200)
ax_iter.axhline(0, color='gray', linestyle='--', linewidth=1.5, alpha=0.5, zorder=5)

# Zeitmarker T_min
ax_iter.axvline(T_min, color='gray', linestyle='--', linewidth=1.5,
            alpha=0.5, label=f'T_min = {T_min:.3f}s')

# Zeitmarker T_max
ax_iter.axvline(T_max, color='gray', linestyle='--', linewidth=1.5,
            alpha=0.5, label=f'T_max = {T_max:.3f}s')

# Visualisierungsmethoden
if VISUALIZE_ITERATIONS and collision_possible:
    T0 = (T_lower + T_upper) / 2

    # Newton-Raphson mit Visualisierung
    T_opt_vis, iters_vis = newton_raphson_visualized(
        delta_phi, delta_phi_derivative, T0, T_lower, T_upper,
        ax_iter, tol=1e-6, show_labels=SHOW_ITERATION_LABELS
    )

    if T_opt_vis is not None:
        method_vis = "Newton-Raphson (visualisiert)"
        # Lösung Vertikale
        ax_iter.axvline(T_opt_vis, color='red', linestyle='--', linewidth=2.5,
                        alpha=0.8, zorder=250, label='Lösung (vertikal)')
        ax_iter.scatter([T_opt_vis], [np.degrees(delta_phi(T_opt_vis))],
                        color='red', s=200, marker='*', zorder=300,
                        edgecolors='darkred', linewidths=2, label='Lösung')
    else:
        # Fallback Bisection
        T_samples = np.linspace(T_lower, T_upper, 100)
        delta_phi_samples = [delta_phi(t) for t in T_samples]

        T_a, T_b = None, None
        for i in range(len(delta_phi_samples) - 1):
            if not np.isinf(delta_phi_samples[i]) and not np.isinf(delta_phi_samples[i + 1]):
                if delta_phi_samples[i] * delta_phi_samples[i + 1] < 0:
                    T_a = T_samples[i]
                    T_b = T_samples[i + 1]
                    break

        if T_a is not None:
            T_opt_vis, iters_vis = bisection_visualized(
                delta_phi, T_a, T_b, ax_iter, tol=1e-6,
                show_labels=SHOW_ITERATION_LABELS
            )
            method_vis = "Bisection (visualisiert)"
            if T_opt_vis is not None:
                ax_iter.axvline(T_opt_vis, color='red', linestyle='--', linewidth=2.5,
                                alpha=0.8, zorder=250, label='Lösung (vertikal)')
                ax_iter.scatter([T_opt_vis], [np.degrees(delta_phi(T_opt_vis))],
                                color='red', s=200, marker='*', zorder=300,
                                edgecolors='darkred', linewidths=2, label='Lösung')



ax_iter.set_xlabel('Zeit T [s]', fontsize=13)
ax_iter.set_ylabel('Winkeldifferenz Δφ [°]', fontsize=13)
ax_iter.set_title(f'Iteratives Lösungsverfahren: {method_vis if VISUALIZE_ITERATIONS else method_used}',
                  fontsize=14, fontweight='bold')
ax_iter.grid(True, alpha=0.3, zorder=1)
if SHOW_ITERATION_LABELS:
    ax_iter.legend(loc='best', fontsize=8, ncol=2)
else:
    ax_iter.legend(loc='best', fontsize=10)

plt.tight_layout()
plt.show()