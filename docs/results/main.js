
function showInfo(name, desc) {
    document.getElementById('tooltipTitle').textContent = name;
    document.getElementById('tooltipContent').textContent = desc;
    document.getElementById('tooltipOverlay').classList.add('active');
    document.getElementById('tooltipModal').classList.add('active');
}

function hideInfo() {
    document.getElementById('tooltipOverlay').classList.remove('active');
    document.getElementById('tooltipModal').classList.remove('active');
}

function getVal(id) { return parseFloat(document.getElementById(id).value); }
function setVal(id, val) {
    document.getElementById(id).value = typeof val === 'number' ? val.toFixed(4) : val;
}


function drawVectors(vectors) {
    const data = [];

    vectors.forEach(v => {
        data.push({
            x: [0, v.x],
            y: [0, v.y],
            mode: "lines+markers+text",
            type: "scatter",
            text: v.label || "",
            textposition: "top right",
            marker: { size: 6 },
            line: { width: 2 }
        });
    });

    Plotly.newPlot("vecplot", data, {
        xaxis: { range: [-50, 50], scaleanchor: "y", scaleratio: 1, zeroline: true },
        yaxis: { range: [-50, 50], zeroline: true },
        margin: { t: 10 }
    });
}



class Vector2D {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    clone() {
        return new Vector2D(this.x, this.y);
    }

    add(other) {
        return new Vector2D(this.x + other.x, this.y + other.y);
    }

    subtract(other) {
        return new Vector2D(this.x - other.x, this.y - other.y);
    }

    dot(other) {
        return this.x * other.x + this.y * other.y;
    }

    magnitude() {
        return Math.sqrt(this.x ** 2 + this.y ** 2);
    }

    scale(scalar) {
        return new Vector2D(this.x * scalar, this.y * scalar);
    }

    normalize() {
        const mag = this.magnitude();
        return mag === 0 ? new Vector2D(0, 0) : this.scale(1 / mag);
    }
}

/**
 * Berechnet die Kollisionszeit zwischen einer fliegenden Kugel und einem rotierenden Kranarm
 *
 * @param {number} x_off - Pivot x-Position (m)
 * @param {number} y_off - Pivot y-Position (m)
 * @param {number} r - Armlänge / Kreisradius (m)
 * @param {number} alpha_0 - Kran-Startwinkel im alten System (Grad)
 * @param {number} omega - Winkelgeschwindigkeit (rad/s), positiv = gegen Uhrzeiger
 * @param {number} v - Kugelgeschwindigkeit (m/s)
 * @param {number} T_offset - Zeitverzögerung: Kran startet nach T_offset Sekunden (s)
 * @returns {Object} { time: number, theta: number, phi: number } - Kollisionszeit in Sekunden, Abschusswinkel theta (rad), Position phi (rad), oder { time: null, theta: null, phi: null } falls keine Kollision möglich
 */
function calculateCraneCollision(x_off, y_off, r, alpha_0, omega, v, T_offset = 0) {

    // ========================================================================
    // KOORDINATENTRANSFORMATION
    // ========================================================================

    // Konvertiere alpha_0 von Grad zu Radiant
    const alpha_0_rad = alpha_0 * Math.PI / 180;

    // Distanz vom alten Ursprung zum Drehpunkt (negativ, Kugel links vom Drehpunkt)
    const u = -Math.sqrt(x_off ** 2 + y_off ** 2);

    // Rotationswinkel des Koordinatensystems
    const rotation_angle = Math.atan2(y_off, x_off);

    // Kran-Startwinkel im neuen System
    const alpha_start = (Math.PI / 2 - alpha_0_rad) - rotation_angle;

    // ========================================================================
    // HILFSFUNKTIONEN
    // ========================================================================

    /**
     * Streckenfunktion: Distanz zwischen Kugelursprung U und Schnittpunkt mit Kreissegment
     */
    function h_theta(theta) {
        const sin_theta = Math.sin(theta);
        const cos_theta = Math.cos(theta);
        const discriminant = r ** 2 - u ** 2 * sin_theta ** 2;

        if (discriminant < 0) {
            return Infinity; // Kein Schnittpunkt
        }

        return -u * cos_theta + Math.sqrt(discriminant);
    }

    /**
     * Umkehrfunktion: Berechne θ aus Flugzeit T
     */
    function theta_from_T(T) {
        if (T === 0 || Math.abs(T) < 1e-10) {
            return NaN;
        }

        const arg = -(u ** 2 + (T * v) ** 2 - r ** 2) / (2 * u * T * v);

        if (arg < -1 || arg > 1) {
            return NaN; // Ungültig
        }

        return Math.acos(arg);
    }

    /**
     * Kugelposition P auf dem Kreissegment für gegebenes θ
     */
    function P_kugel(theta) {
        const h = h_theta(theta);
        const x = h * Math.cos(theta) + u;
        const y = h * Math.sin(theta);
        return [x, y];
    }

    /**
     * Kugelwinkel φ im inneren Kreissegment als Funktion der Zeit
     */
    function phi_kugel(T) {
        const theta = theta_from_T(T);

        if (isNaN(theta)) {
            return NaN;
        }

        const [x, y] = P_kugel(theta);
        const phi = Math.atan2(y, x);

        // Nur 1. Quadrant ist gültig [0, π/2]
        if (phi < 0 || phi > Math.PI / 2) {
            return NaN;
        }

        return phi;
    }

    /**
     * Kranwinkel φ als Funktion der Zeit
     */
    function phi_kran(T, skip_normalization = false) {
        let phi;

        if (T < T_offset) {
            phi = alpha_start;
        } else {
            phi = alpha_start + omega * (T - T_offset);
        }

        // Normalisiere auf [0, 2π[
        if (!skip_normalization) {
            phi = phi % (2 * Math.PI);
            if (phi < 0) phi += 2 * Math.PI; //TODO Fixed?? fix-01
        }

        return phi;
    }

    /**
     * Differenzfunktion: Δφ(T) = φ_kugel(T) - φ_kran(T)
     */
    function delta_phi(T) {
        const phi_k = phi_kugel(T);
        const phi_kr = phi_kran(T);

        if (isNaN(phi_k)) {
            return Infinity; // Kugel außerhalb gültigen Bereichs
        }

        // Prüfe ob Kran im Kreissegment [0, π/2]
        if (phi_kr < 0 || phi_kr > Math.PI / 2) {
            return Infinity;
        }

        return phi_k - phi_kr;
    }

    // ========================================================================
    // GÜLTIGKEITSBEREICH
    // ========================================================================

    const theta_min = 0.0;
    const h_min = h_theta(theta_min);
    const T_min = h_min / v;

    const theta_max = Math.atan(r / Math.abs(u));
    const h_max = h_theta(theta_max);
    const T_max = h_max / v;

    //const phi_min = 0.0;
    //const phi_max = Math.PI / 2; // Removed fix-01

    // ========================================================================
    // GUARD CLAUSE: Analytische Kollisionsprüfung
    // ========================================================================

    const T_check_min = Math.min(T_min, T_max);
    const T_check_max = Math.max(T_min, T_max);

    // Effektive Rotationsdauer des Krans
    const T_kran_start_effective = Math.max(T_check_min, T_offset);

    if (T_kran_start_effective >= T_check_max) {
        return { time: null, theta: null, phi: null }; //Consistentency change fix-01
    }

    const rotation_duration = T_check_max - T_kran_start_effective;

    // Winkelpositionen des Krans (ohne Modulo-Normalisierung)
    const phi_kran_start = alpha_start + omega * Math.max(0, T_check_min - T_offset);
    const phi_kran_end = alpha_start + omega * Math.max(0, T_check_max - T_offset);
    const delta_phi_kran = phi_kran_end - phi_kran_start;

    // Prüfe ob Kran das Segment [0, π/2] durchläuft
    let collision_possible = false;

    // Fall A: Mindestens eine volle 90° Drehung
    if (Math.abs(delta_phi_kran) >= Math.PI / 2) {
        collision_possible = true;
    } else {
        // Fall B: Kleine Rotation
        const phi_start_mod = ((phi_kran_start % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const phi_end_mod = ((phi_kran_end % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

        const segment_min = 0.0;
        const segment_max = Math.PI / 2;

        if (omega >= 0) {
            // Vorwärts (gegen Uhrzeigersinn)
            if (phi_start_mod <= phi_end_mod) {
                if (phi_start_mod <= segment_max && phi_end_mod >= segment_min) {
                    collision_possible = true;
                }
            } else {
                // Wrap-Around
                collision_possible = true;
            }
        } else {
            // Rückwärts (im Uhrzeigersinn)
            if (phi_end_mod <= phi_start_mod) {
                if (phi_end_mod <= segment_max && phi_start_mod >= segment_min) {
                    collision_possible = true;
                }
            } else {
                // Wrap-Around
                if (segment_min <= phi_start_mod || segment_max >= phi_end_mod) {
                    collision_possible = true;
                }
            }
        }
    }

    if (!collision_possible) {
        return { time: null, theta: null, phi: null, thetaRad: null, phiRad: null}; // Kran durchläuft Segment nicht //consistency change fix-01
    }

    // ========================================================================
    // NULLSTELLENSUCHE: Newton-Raphson mit Bisection-Fallback
    // ========================================================================

    /**
     * Numerische Ableitung von Δφ(T)
     */
    function delta_phi_derivative(T, epsilon = 1e-6) {
        return (delta_phi(T + epsilon) - delta_phi(T - epsilon)) / (2 * epsilon);
    }

    /**
     * Newton-Raphson-Verfahren
     */
    function newton_raphson(func, dfunc, T_initial, T_min_bound, T_max_bound, tol = 1e-3, max_iter = 20) {
        let T_current = T_initial;

        for (let iteration = 0; iteration < max_iter; iteration++) {
            const function_value = func(T_current);

            // Abbruch 1: Nullstelle gefunden
            if (Math.abs(function_value) < tol) {
                return [T_current, iteration + 1];
            }

            const derivative_value = dfunc(T_current);

            // Abbruch 2: Horizontale Tangente
            if (Math.abs(derivative_value) < 1e-10) {
                return [null, iteration + 1];
            }

            // Newton-Schritt
            const T_next = T_current - function_value / derivative_value;

            // Abbruch 3: Außerhalb des gültigen Bereichs
            if (T_next < T_min_bound || T_next > T_max_bound) {
                return [null, iteration + 1];
            }

            T_current = T_next;
        }

        // Abbruch 4: Maximale Iterationen
        return [null, max_iter];
    }

    /**
     * Bisektionsmethode
     */
    function bisection(func, T_left_start, T_right_start, tol = 1e-3, max_iter = 50) {
        let T_left = T_left_start;
        let T_right = T_right_start;

        let f_left = func(T_left);
        let f_right = func(T_right);

        // Vorbedingung: Vorzeichenwechsel
        if (f_left * f_right > 0) {
            return [null, 0];
        }

        for (let iteration = 0; iteration < max_iter; iteration++) {
            const T_mid = (T_left + T_right) / 2;
            const f_mid = func(T_mid);

            // Abbruch 1: Nullstelle gefunden
            if (Math.abs(f_mid) < tol) {
                return [T_mid, iteration + 1];
            }

            // Abbruch 2: Intervall sehr klein
            const interval_width = T_right - T_left;
            if (interval_width / 2 < tol) {
                return [T_mid, iteration + 1];
            }

            // Intervall-Halbierung
            if (f_left * f_mid < 0) {
                T_right = T_mid;
                f_right = f_mid;
            } else {
                T_left = T_mid;
                f_left = f_mid;
            }
        }

        // Abbruch 3: Maximale Iterationen
        return [(T_left + T_right) / 2, max_iter];
    }

    // ========================================================================
    // AUSFÜHRUNG: Berechnung der Kollisionszeit
    // ========================================================================

    const T_lower = Math.min(T_min, T_max);
    const T_upper = Math.max(T_min, T_max);
    const T0 = (T_lower + T_upper) / 2;

    // Versuch 1: Newton-Raphson
    let [T_optimal, iters_newton] = newton_raphson(
        delta_phi, delta_phi_derivative, T0, T_lower, T_upper, 1e-6
    );

    if (T_optimal !== null) {
        ///* //TODO Fixed?? fix-01
        const min_error = Math.abs(delta_phi(T_optimal));
        // Prüfe ob Treffer (< 1° Differenz)
        if (min_error < Math.PI / 180) { //*///TODO Fixed?? fix-01


            const theta_opt = theta_from_T(T_optimal);
            const phi_opt = phi_kugel(T_optimal);
            return {
                time: T_optimal,
                theta: theta_opt * (180 / Math.PI),
                phi: phi_opt * (180 / Math.PI),
                beta: rotation_angle * (180 / Math.PI),
                thetaRad:  theta_opt,
                phiRad: phi_opt,
                betaRad: rotation_angle
            };

        } //TODO Fixed?? fix-01
    }

    // Newton-Raphson fehlgeschlagen: Bisection Fallback
    // Vorzeichenwechsel finden
    const num_samples = 100;
    const T_samples = [];
    for (let i = 0; i < num_samples; i++) {
        T_samples.push(T_lower + (T_upper - T_lower) * i / (num_samples - 1));
    }

    const delta_phi_samples = T_samples.map(t => delta_phi(t));

    let T_a = null;
    let T_b = null;

    for (let i = 0; i < delta_phi_samples.length - 1; i++) {
        if (!isFinite(delta_phi_samples[i]) || !isFinite(delta_phi_samples[i + 1])) {
            continue;
        }
        if (delta_phi_samples[i] * delta_phi_samples[i + 1] < 0) {
            T_a = T_samples[i];
            T_b = T_samples[i + 1];
            break;
        }
    }

    if (T_a !== null) {
        const [T_optimal_bis, iters_bisection] = bisection(delta_phi, T_a, T_b, 1e-6);

        if (T_optimal_bis !== null) {
            // /*         //TODO Fixed?? fix-01
            const min_error = Math.abs(delta_phi(T_optimal_bis));
            if (min_error < Math.PI / 180) {  //*/ //TODO Fixed?? fix-01


                const theta_opt = theta_from_T(T_optimal_bis);
                const phi_opt = phi_kugel(T_optimal_bis);
                return {
                    time: T_optimal,
                    theta: theta_opt * (180 / Math.PI),
                    phi: phi_opt * (180 / Math.PI),
                    beta: rotation_angle * (180 / Math.PI),
                    thetaRad:  theta_opt,
                    phiRad: phi_opt,
                    betaRad: rotation_angle
                };


            }//TODO Fixed?? fix-01
        }
    }

    return {
        time: null,
        theta: null,
        phi: null ,
        beta: rotation_angle * (180 / Math.PI),
        thetaRad: null,
        phiRad: null,
        betaRad: rotation_angle
    }; // Keine Kollision gefunden //consistency change fix-01
}

function seq_four_orthogonalProjection(v_b, vk) {
    const vbVec = new Vector2D(vb.x, vb.y);
    const vkVec = new Vector2D(vk.x, vk.y);

    // Calculate v_kp and v_ko
    const scalarProjection = vbVec.dot(vkVec) / vbVec.magnitude() ** 2;
    const vkp = vbVec.scale(scalarProjection);
    const vko = vkVec.subtract(vkp);

    return {
        vkp,
        vko,
    };



}





// deg * pi/180 = rad       rad * 180/pi = deg
function seq_one(x, y, b, phi, sigma = null) {
    const h = Math.sqrt(x ** 2 + y ** 2);
    //console.log("h:", h);

    const alpha = Math.acos((h ** 2 + y ** 2 - x ** 2) / (2 * h * y)) * (180 / Math.PI); // acos outputs in rad; convert to deg
    //console.log("alpha:", alpha);
    const beta = 180 - 90 - alpha;
    //console.log("beta:", beta);
    const gamma = 90 - phi;
    //  console.log("gamma:", gamma);
    const epsilon = 180 - alpha - gamma;
    //  console.log("epsilon:", epsilon);

    // Kosinussatz statt Sinus:
    const u = Math.sqrt(h ** 2 + b ** 2 - 2 * h * b * Math.cos(epsilon * Math.PI / 180)); // cos wants rad; convert previous deg to rad
    //  console.log("u:", u);

    // Sinussatz korrekt:
    const kappa = Math.acos((b**2 + u**2 - h**2) / (2 * b * u)) * (180 / Math.PI);
    //console.log("kappa:", kappa);
    const delta = 180 - epsilon - kappa;
    //  console.log("delta:", delta);

    if (sigma === null) {
        return { h, beta, delta, epsilon, u };
    }

    const tau = 180 - sigma - epsilon;
    const t = (h / Math.sin(tau * Math.PI / 180)) * Math.sin(epsilon * Math.PI / 180);
    const r = (h / Math.sin(tau * Math.PI / 180)) * Math.sin(sigma * Math.PI / 180);

    return { tau, t, r };
}


function seq_two(
    mode,
    alpha, // Launch angle in degrees
    v0, // Initial velocity
    x_target, // Target x-coordinate
    y_target, // Target y-coordinate
    tolerance, // Tolerance for y
    ax = 0, // Acceleration in x-direction (for mode 2)
    q = 0, // Drag coefficient (for mode 3)
    rho = 1.2, // Air density (for mode 3)
    A = 2.38, // Cross-sectional area (for mode 3)
    cw = 0.47, // Drag coefficient (for mode 3)
    m = 1, // Mass of the projectile (for mode 3)
    g = 9.81 // Gravitational acceleration
) {
    // Convert angle to radians
    const alphaRad = (alpha * Math.PI) / 180;

    // Initial velocity components
    const v0x = v0 * Math.cos(alphaRad);
    const v0y = v0 * Math.sin(alphaRad);

    let t, y, vx, vy;

    if (mode === 1) {
        // Unaccelerated motion
        t = x_target / v0x;
        y = v0y * t - 0.5 * g * t ** 2;
        vx = v0x;
        vy = v0y - g * t;
    } else if (mode === 2) {
        // Accelerated motion
        t = (-v0x + Math.sqrt(v0x ** 2 + 2 * ax * x_target)) / ax;
        y =
            (v0y / ax) * (-v0x + Math.sqrt(v0x ** 2 + 2 * ax * x_target)) -
            (g / (2 * ax ** 2)) *
            (-v0x + Math.sqrt(v0x ** 2 + 2 * ax * x_target)) ** 2;
        vx = v0x + ax * t;
        vy = v0y - g * t;
    } else if (mode === 3) {
        // Decelerated motion
        const qValue = q || (A * rho * cw) / (2 * m);
        t = (Math.exp(qValue * x_target) - 1) / (qValue * v0x);
        y =
            v0y * t -
            0.5 * g * t ** 2 -
            (g / (2 * qValue ** 2)) *
            (Math.exp(qValue * x_target) - 1) ** 2;
        vx = v0x / (qValue * v0x * t + 1);
        vy = v0y - g * t;
    } else {
        throw new Error("Invalid mode. Use 1 (unaccelerated), 2 (accelerated), or 3 (decelerated).");
    }

    // Check if y is within the tolerance
    const withinTolerance = Math.abs(y - y_target) <= tolerance;

    return {
        withinTolerance,
        velocity: Math.sqrt(vx ** 2 + vy ** 2),
    };
}

// Example usage
const result_two = seq_two(1, 45, 20, 5, 0.1);
console.log(result_two);


function seq_three_dpr(m, l, l0, mc, vc, /*vct=0, */ tau_deg,  vb, k, meff) {
    // Calculate I
    const I1 = (1 / 12) * m * l ** 2;
    const I2 = (m / (3 * l)) * ((l + l0) ** 3 - l0 ** 3);
    const I = I1 + I2;

    const vct = vc * Math.sin(tau_deg* Math.PI / 180); // Convert tau to radians

    // Calculate v'_c,t
    const vctPrime = (mc * vct - meff * (vct - vb) * k) / (mc + meff);

    // Calculate v'_b
    const vbPrime = (mc * vct + mc * (vct - vb) * k) / (mc + meff);

    // Calculate r_opt
    const ropt = Math.sqrt(I / mc);

    return {
        I1,
        I2,
        I,
        vctPrime,
        vbPrime,
        ropt,
    };
}

/**
 * Computes the crane boom inertia, effective mass, and post-impact velocities
 * for a partially elastic collision between a vehicle and a crane boom.
 *
 * @param {number} m_boom    - Mass of the boom [kg]
 * @param {number} l_boom    - Length of the boom [m]
 * @param {number} l_offset  - Offset distance of the counterweight start from the rotation axis [m]
 * @param {number} l_weight  - Length of the counterweight section [m]
 * @param {number} m_weight  - Mass of the counterweight [kg]
 * @param {number} r_impact  - Radius from the pivot to the impact point on the boom [m]
 * @param {number} mc        - Mass of the colliding vehicle [kg]
 * @param {number} vc        - Vehicle speed before impact [m/s]
 * @param {number} tau_deg   - Angle between vehicle motion and boom's tangential direction at impact [deg]
 * @param {number} vb        - Initial tangential boom velocity (usually 0) [m/s]
 * @param {number} k         - Coefficient of restitution (impact elasticity) [-]
 *
 * @returns {{
 *   I1: number,        // Moment of inertia of the boom [kg*m^2]
 *   I2: number,        // Moment of inertia of the counterweight [kg*m^2]
 *   I: number,         // Total moment of inertia[kg*m^2]
 *   vctPrime: number,  // Tangential vehicle velocity after impact [m/s]
 *   vbPrime: number,   // Boom tangential velocity after impact [m/s]
 *   omega_b_prime: number, // Boom angular velocity after impact [rad/s]
 *   ropt: number       // Optimal radius for maximum energy transfer [m]
 * }}
 */
function seq_three(m_boom, l_boom, l_offset, l_weight, m_weight, r_impact, mc, vc, /*vct=0, */ tau_deg,  vb, k) {
    // Calculate I
    const I1 = (1 / 12) * m_boom * l_boom ** 2;
    const I2 = (m_weight / (3 * l_weight)) * ((l_weight + l_offset) ** 3 - l_offset ** 3);
    const I = I1 + I2;
    const m_eff = I / (r_impact ** 2);
    const vct = vc * Math.sin(tau_deg* Math.PI / 180); // Convert tau to radians

    // Calculate v'_c,t
    const vctPrime = (mc * vct - m_eff * vct * k) / (mc + m_eff);

    // Calculate v'_b
    const vbPrime = (mc * vct + mc * (vct - vb) * k) / (mc + m_eff);

    // Calculate r_opt
    const ropt = Math.sqrt(I / mc);

    /*console.log("m_eff:", m_eff);
    console.log("I:", I);
    console.log("I1:", I1);
    console.log("I2:", I2);*/

    return {
        I1,
        I2,
        I,
        vctPrime,
        vbPrime,
        omega_b_prime: vbPrime / r_impact,
        ropt,
    };
}


function seq_four(vb, vk, rho_i, rho_a, ri, Ra, m, Ic, rc, k) {
    const v_b = new Vector2D(vb.x, vb.y);
    const v_k = new Vector2D(vk.x, vk.y);
    /* //
  //orthogonalProjection v_b, vk -> {scalar, parallel: v_kp, normal: v_ko}
        const denom = v_b.dot(v_b);
        // if v_b is the zero vector, the projection onto it is undefined;
        // we return parallel = zero vector and normal = vk (no component along v_b).
        if (denom === 0) {
            console.warn("Warning: v_b is the zero vector; projection is undefined.");
            return {
                scalar: 0,
                parallel: new Vector2D(0, 0), // v_{kp}
                normal: v_k.clone()             // v_{ko} = vk - 0 = vk
            };
        }
     const x = v_b.dot(v_k) / denom;
     const v_kp = v_b.scale(x);
     const v_ko = v_k.subtract(v_kp);*/


    const m_eff = Ic / (rc ** 2);

    console.log("m_eff: ", m_eff);


    // Calculate I_Kugel
    const I_Kugel = (8 * Math.PI / 15) * (rho_i * ri ** 5 + rho_a * (Ra ** 5 - ri ** 5));

    //calculate ball shell volumes
    const V_Kugel_inner = (4/3)*(ri**3*Math.PI);

    const V_Kugel_outer = (4/3)*(Ra**3*Math.PI) - V_Kugel_inner;

    const m_k = V_Kugel_inner*rho_i + V_Kugel_outer* rho_a;
    console.log("m_k: ", m_k)

    // --- compute unit axis n from v_b (the axis you project on) ---
    const n = v_b.clone().normalize();   // unit collision axis

    // signed parallel scalars (signed velocities along n)
    const v_kp_signed = v_k.dot(n);      // v_k projected onto n (signed)
    const v_bp_signed = v_b.dot(n);      // v_b projected onto n (signed) — equivalently v_b.magnitude() if n = v_b/|v_b|

    // collision (1D along n) using signed scalars
    const numerator_k = m_k * v_kp_signed + m_eff * v_bp_signed;
    const dv = v_kp_signed - v_bp_signed;   // signed relative speed

    const v_kp_prime_mag = (numerator_k - m_eff * dv * k) / (m_k + m_eff);
    const v_b_prime_mag  = (numerator_k + m_k   * dv * k) / (m_k + m_eff);

    // reconstruct parallel vector using **n** (preserves sign)
    const v_kp_prime = n.scale(v_kp_prime_mag);

    // (unchanged) perpendicular component
    // v_kp (vector) is still v_b.scale(x) earlier; you can also recompute v_kp = n.scale(v_kp_signed)
    const v_kp = n.scale(v_kp_signed);
    const v_ko = v_k.subtract(v_kp);

    // final vector after collision = perp + new parallel
    const v_k_res = v_ko.add(v_kp_prime);


    console.log("vko ", v_ko);
    console.log("vkp ", v_kp);
    console.log("vkp_prime ", v_kp_prime);
    console.log("vk_res", v_k_res);

    //const v0 = v_k_res.magnitude(); //reduced after collision //magnitude looses sign!
    //const v0_signed = v_k_res.dot(n); // signed magnitude after collision
    const v0_unsigned = v_k_res.magnitude();

    /*
    avoid this unstable division by possibly very small magnitudes
    let v0_sign = v_kp_prime.normalize().x/v_kp.normalize().x; // v_kp and v_kp_prime are along same axis, but can
  // point in different directions; use x-component to determine sign of the resulting magnitude direction and vector
    v0_sign = v0_sign >= 0 ? Math.ceil(v0_sign) : Math.floor(v0_sign); //round to +1 or -1
    console.log("v0_sign", v0_sign);
     */

    //const v0_dot = v_k_res.dot(v_k_res.normalize()); also loses sign since we dont know parallel direction of v_k_res directly
    const v0_sign = v_kp.dot(v_kp_prime) >=0 ? 1 : -1; // sign based on whether v_kp and v_kp_prime point in same direction or not
    console.log("sign", v0_sign);
    console.log("unsigned", v0_unsigned);
    const v0 = v0_unsigned * v0_sign; // signed magnitude after collision
    console.log("v0", v0);



    const w0 = v_k.magnitude() / Ra; // unaffected; using initial vk

    const v_diff = v_k_res.magnitude() - v_k.magnitude();
    const delta0 = w0 * Ra - v0;

    //const v_end_mag = v0 + (delta0 * I_Kugel) / (m * Ra ** 2 + I_Kugel);
    const v_end_mag =  (delta0 * I_Kugel) / (m * Ra ** 2 + I_Kugel);
    console.log("v_end_mag", v_end_mag);

    const v_end = v_k.normalize().scale(v_end_mag); //initial direction weighted with the new acceleration
    console.log("v_end", v_end);

    const vk_final = v_k_res.add(v_end);
    console.log("vk_final", vk_final);

    /*
    //angle between vk_final and v_k_res should not be zero
    const angle_between = Math.acos(vk_final.dot(v_k_res) / (vk_final.magnitude() * v_k_res.magnitude())) * (180 / Math.PI);
    console.log("angle between vk_final and v_k_res:", angle_between);

    //angle between vk_p and v_kp_prime should be zero
    const angle_between_p = Math.acos(v_kp.dot(v_kp_prime) / (v_kp.magnitude() * v_kp_prime.magnitude())) * (180 / Math.PI);
    console.log("angle between vk_p and v_kp_prime:", angle_between_p.toFixed(10));
    */

    if(debugVectors){
    drawVectors([
        { x: v_b.x, y: v_b.y, label: "vb" },
        { x: v_k.x, y: v_k.y, label: "vk" },
        { x: v_kp.x, y: v_kp.y, label: "vk_p" },
        { x: v_ko.x, y: v_ko.y, label: "vk_o" },
        { x: v_kp_prime.x, y: v_kp_prime.y, label: "vk_p'" },
        { x: v_k_res.x, y: v_k_res.y, label: "vk_res" },
        { x: v_end.x, y: v_end.y, label: "v_end" },
        { x: vk_final.x, y: vk_final.y, label: "vk_final" },
    ]);
    }

    return { //v_end
        I_Kugel: I_Kugel,
        M_Kugel: m_k,
        vb: v_b, //unchanged
        vk: v_k, //unchanged
        vkp: v_kp,
        vko: v_ko,
        vkp_prime: v_kp_prime,
        vk_res: v_k_res,
        vk_rot_end: v_end,
        vk_final: vk_final
    };

}
//x off and y off to crane base center; crane angle is phi - beta (and in deg!), so already accounted for the rotation; r is boom length; v_ges is the resulting ball velocity vector after impact
function seq_five(x_off, y_off, crane_angle_deg, r, v_ges) {
    //crane_angle = phi - beta
    const crane_angle = crane_angle_deg * (Math.PI / 180); //convert to rad
    const x_boom = Math.cos(crane_angle) * r;
    const y_boom = Math.sin(crane_angle) * r;

    // da der kran immer im 3. quadranten ist, können die werte konsequent voneinander subtrahiert werden:

    const x = x_off - x_boom;
    const y = y_off - y_boom;

    const eta_offset = Math.atan2(y, x); //baseline; vector angle must be >= than this to reach the water

    const v_norm = v_ges.normalize();
    const eta_vector = Math.atan2(v_norm.y, v_norm.x);

    const delta_eta = eta_offset-eta_vector;

    return {
        eta_offset,
        eta_offset_deg: eta_offset * (180 / Math.PI),
        eta_vector,
        eta_vector_deg: eta_vector * (180 / Math.PI),
        delta_eta,
        delta_eta_deg: delta_eta * (180 / Math.PI),
    };


}
/* const result_four = calculateCraneCollision(
         9.0,  // x_off
         -5.0,  // y_off
         5.0,   // r
         130,   // alpha_0 (Grad)
         3.5,   // omega
         30,    // v
         0.15   // T_offset
 );

 if (result_four.time === -1) {
   console.log("Kollisionszeit: Keine Kollision");
 } else {
   console.log("Kollisionszeit:", result_four.time.toFixed(4), "Sekunden");
   console.log("Abschusswinkel θ:", ((result_four.theta * 180 / Math.PI)%360).toFixed(2), "°");
   console.log("Position φ:", ((result_four.phi * 180 / Math.PI)%360).toFixed(2), "°");
 }*/

/**
 * Splits an interval [start, end] into n equidistant values.
 * Works for fractional values as well (e.g. 0.1 to 0.5).
 *
 * @param {number} start - The starting bound of the interval.
 * @param {number} end - The ending bound of the interval.
 * @param {number} n - Number of points (including both ends if desired).
 * @param {boolean} [includeEnd=true] - Whether to include the end value in the result.
 * @returns {number[]} An array of equidistant values.
 */
function splitInterval(start, end, n, includeEnd = true) {
    if (n <= 0) return [];
    if (n === 1) return [start];

    const step = (end - start) / (includeEnd ? (n - 1) : n);
    const result = [];

    for (let i = 0; i < n; i++) {
        result.push(start + step * i);
    }

    return result;
}

/**
 * Creates run result object storing all sequence data
 * for ~50*25*20 = 25,000 objects with ~500 bytes each -> ~12.5 MB total seems manageable for modern systems?
 */
function createRunResult(v_idx, w_idx, a_idx, speed, angle, accel_value, branch) {
    return {
        // Coordinates for 3D plot
        x: speed,           // bare speed value
        y: angle,           // bare angle value
        z: a_idx,           // acceleration iterator (bare values would be too dense)

        // Meta info
        branch: branch,     // 'NEUTRAL', 'ACCEL', 'DECEL'
        v_idx: v_idx,
        w_idx: w_idx,
        a_idx: a_idx,
        accel_value: accel_value,  // actual acceleration/cw value

        // Sequence completion level (0-5)
        // 0 = seq_two failed, 1 = seq_three failed, 2 = crane failed,
        // 3 = vectors failed, 4 = seq_four failed, 5 = seq_five completed
        seq_success: 0,

        // final result (null if not reached)
        eta_angle: null,    // deciding factor for success :DD

        // sequence results getting populated as the pipeline progresses
        seq_two: null,
        seq_three: null,
        crane_collision: null,
        vectors: null,
        seq_four: null,
        seq_five: null
    };
}

// global results collection for manipulation from different scopes
let runResults = [];


/**
 * Classifies run result for visualization
 * Returns { category, color, size, opacity }
 */
function classifyResult(result) {
    // failed before final angle calculation
    if (result.seq_success < 5 || result.eta_angle === null) {
        return {
            category: 'early_fail',
            color: 'rgba(255, 0, 0, 0.15)',  // very transparent red
            size: 3,
            opacity: 0.15
        };
    }

    // Reached final angle but negative (failure)
    if (result.eta_angle < 0) {
        return {
            category: 'angle_fail',
            color: 'rgba(255, 50, 50, 0.5)',  // medium transparent red
            size: 6,
            opacity: 0.5
        };
    }

    //Color based success visualized by angle magnitude (yellow -> green)
    // Normalize angle for color interpolation
    const maxAngle = 45;  // degrees  //TODO: adjust based on expected range
    const normalized = Math.min(result.eta_angle / maxAngle, 1);

    //interpolate from yellow (only closely successful) to green
    const r = Math.round(255 * (1 - normalized));
    const g = Math.round(180 + 75 * normalized);  // 180-255
    const b = 0;

    return {
        category: 'success',
        color: `rgba(${r}, ${g}, ${b}, 0.85)`,
        size: 7,
        opacity: 0.85
    };
}

/**
 * group results by classification for efficient plotting
 */
function groupResultsByCategory(results) {
    const groups = {
        early_fail: { x: [], y: [], z: [], colors: [], sizes: [], opacities: [], texts: [] },
        angle_fail: { x: [], y: [], z: [], colors: [], sizes: [], opacities: [], texts: [] },
        success:    { x: [], y: [], z: [], colors: [], sizes: [], opacities: [], texts: [] }
    };

    for (const result of results) {
        const cls = classifyResult(result);
        const group = groups[cls.category];

        group.x.push(result.x);
        group.y.push(result.y);
        group.z.push(result.z);
        group.colors.push(cls.color);
        group.sizes.push(cls.size);
        group.opacities.push(cls.opacity);

        // Hover text
        const eta = result.eta_angle !== null ? result.eta_angle.toFixed(2) + '°' : 'N/A';
        group.texts.push(
            `Branch: ${result.branch}<br>` +
            `Speed: ${result.x.toFixed(2)} m/s<br>` +
            `Angle: ${result.y.toFixed(2)}°<br>` +
            `Accel idx: ${result.z}<br>` +
            `Seq level: ${result.seq_success}/5<br>` +
            `Eta: ${eta}`
        );
    }

    return groups;
}

/**
 * 3D scatter plot traces from grouped results
 */
function createPlotTraces(groups) {
    const traces = [];

    const categoryConfig = {
        early_fail: { name: 'Early Failures', legendgroup: 'fail' },
        angle_fail: { name: 'Angle Failures', legendgroup: 'fail' },
        success:    { name: 'Successes', legendgroup: 'success' }
    };

    for (const [category, group] of Object.entries(groups)) {
        if (group.x.length === 0) continue;

        const config = categoryConfig[category];

        traces.push({
            x: group.x,
            y: group.y,
            z: group.z,
            mode: 'markers',
            type: 'scatter3d',
            name: config.name,
            legendgroup: config.legendgroup,
            marker: {
                size: group.sizes,
                color: group.colors,
                opacity: category === 'success' ? 0.85 : group.opacities[0]
            },
            text: group.texts,
            hoverinfo: 'text'
        });
    }

    return traces;
}

/**
 * actual 3D scatter plot result
 */
function renderResultsPlot(results, containerId = 'results-plot') {
    const groups = groupResultsByCategory(results);
    const traces = createPlotTraces(groups);

    const layout = {
        title: 'Collision Simulation Results',
        scene: {
            xaxis: { title: 'Speed (m/s)' },
            yaxis: { title: 'Angle (°)' },
            zaxis: { title: 'Acceleration Index' }
        },
        legend: {
            x: 0.02,
            y: 0.98
        },
        margin: { l: 0, r: 0, t: 40, b: 0 }
    };

    const config = {
        responsive: true,
        displayModeBar: true
    };

    Plotly.newPlot(containerId, traces, layout, config);
}

/**
 * summary statistics of results
 */
function getResultsStats(results) {
    const stats = {
        total: results.length,
        early_fail: 0,
        angle_fail: 0,
        success: 0,
        by_branch: { NEUTRAL: 0, ACCEL: 0, DECEL: 0 },
        by_seq_level: [0, 0, 0, 0, 0, 0],  // 0-5
        avg_success_eta: 0
    };

    let etaSum = 0;

    for (const r of results) {
        const cls = classifyResult(r);
        stats[cls.category]++;
        stats.by_branch[r.branch]++;
        stats.by_seq_level[r.seq_success]++;

        if (cls.category === 'success') {
            etaSum += r.eta_angle;
        }
    }

    if (stats.success > 0) {
        stats.avg_success_eta = etaSum / stats.success;
    }

    return stats;
}


const ignoreDebugLog = true;
const debugVectors = false;

function runPipeline() {
    // clear previous results
    runResults = [];

    // read seq_one params from UI
    const x_one = getVal('seq1_x');
    const y_one = getVal('seq1_y');
    const b = getVal('seq1_b');
    const phi = getVal('seq1_phi');
    const sigma = getVal('seq1_sigma');

    const sigma_max = seq_one(x_one, y_one, b, phi).delta;
    const beta_one = seq_one(x_one, y_one, b, phi).beta;

    setVal('seq1_sigma_max', sigma_max);
    setVal('seq1_beta', beta_one);

    console.log("Maximaler Sigma-Wert:", sigma_max);
    const t_one = seq_one(x_one, y_one, b, phi, sigma_max).t;
    const tau_one = seq_one(x_one, y_one, b, phi, sigma_max).tau;
    const r_one = seq_one(x_one, y_one, b, phi, sigma_max).r;

    setVal('seq1_t', t_one);
    setVal('seq1_tau', tau_one);
    setVal('seq1_r', r_one);
    setVal('seq2_t_input', t_one);
    setVal('seq3_r_impact', r_one);
    setVal('seq3_tau_deg', tau_one);
    setVal('seq5_r', r_one);
    setVal('seq5_crane_angle', phi - beta_one);

    // read interval settings from UI
    const v_max = getVal('v_initial_max');
    const v_min = getVal('v_initial_min');
    const v_steps = Math.floor(getVal('v_steps'));
    const v_values = splitInterval(v_min, v_max, v_steps, true);

    const w_max = getVal('alpha_initial_max');
    const w_min = getVal('alpha_initial_min');
    const w_steps = Math.floor(getVal('alpha_steps'));
    const w_values = splitInterval(w_min, w_max, w_steps, true);

    const a_min = getVal('a_initial_min');
    const a_max = getVal('a_initial_max');
    const a_steps = Math.floor(getVal('a_steps'));
    const a_values = splitInterval(a_min, a_max, a_steps, true);

    const cw_min = getVal('cw_initial_min');
    const cw_max = getVal('cw_initial_max');
    const cw_A_min = getVal('cw_A_initial_min');
    const cw_A_max = getVal('cw_A_initial_max');
    const cw_values = splitInterval(cw_min, cw_max, 5, true).reverse();
    const cw_A_values = splitInterval(cw_A_min, cw_A_max, 5, true).reverse();

    // read seq_two params from UI
    const m_car = getVal('seq2_m_car');
    const g = getVal('seq2_g');
    const rho = getVal('seq2_rho');
    const tolerance = getVal('seq2_tolerance');
    const t_input = t_one;
    const y_target = getVal('seq2_y_target');

    setVal('seq3_mc', m_car);
    setVal('seq4_m', m_car);

    // read seq_three params from UI
    const seq3_m_boom = getVal('seq3_m_boom');
    const seq3_l_boom = getVal('seq3_l_boom');
    const seq3_l_offset = getVal('seq3_l_offset');
    const seq3_l_weight = getVal('seq3_l_weight');
    const seq3_m_weight = getVal('seq3_m_weight');
    const seq3_vb = getVal('seq3_vb');
    const seq3_k = getVal('seq3_k');

    // read crane collision params from UI
    const crane_x_off = getVal('crane_x_off');
    const crane_y_off = getVal('crane_y_off');
    const crane_r = getVal('crane_r');
    const crane_alpha_0 = getVal('crane_alpha_0');
    const crane_v_bomb = getVal('crane_v_bomb');
    const crane_T_offset = getVal('crane_T_offset');

    // read seq_four params from UI
    const seq4_rho_i = getVal('seq4_rho_i');
    const seq4_rho_a = getVal('seq4_rho_a');
    const seq4_ri = getVal('seq4_ri');
    const seq4_Ra = getVal('seq4_Ra');
    const seq4_rc = getVal('seq4_rc');
    const seq4_k = getVal('seq4_k');

    // read seq_five params from UI
    const seq5_x_off = getVal('seq5_x_off');
    const seq5_y_off = getVal('seq5_y_off');

    // helper function for the collision sequence execution
    function runCollisionSequence(runResult, result_trajectory) {
        // seq_three
        const result_seq_three = seq_three(
            seq3_m_boom, seq3_l_boom, seq3_l_offset, seq3_l_weight, seq3_m_weight,
            r_one, m_car, result_trajectory.velocity, tau_one, seq3_vb, seq3_k
        );

        runResult.seq_three = {
            input: { m_boom: seq3_m_boom, l_boom: seq3_l_boom, velocity: result_trajectory.velocity },
            result: result_seq_three
        };

        if (!isFinite(result_seq_three.vbPrime) || !isFinite(result_seq_three.I)) {
            runResult.seq_success = 1;
            console.log(`[${runResult.branch} v=${runResult.v_idx} w=${runResult.w_idx} a=${runResult.a_idx}] FAILED at seq_three`);
            return false;
        }

        setVal('seq3_vc', result_trajectory.velocity);
        setVal('seq4_Ic', result_seq_three.I);
        setVal('crane_omega', result_seq_three.vbPrime / r_one);

        // calculateCraneCollision
        const result_four = calculateCraneCollision(
            crane_x_off, crane_y_off, crane_r, crane_alpha_0,
            result_seq_three.vbPrime / r_one,
            crane_v_bomb, crane_T_offset
        );

        runResult.crane_collision = {
            input: { x_off: crane_x_off, y_off: crane_y_off, omega: result_seq_three.vbPrime / r_one },
            result: result_four
        };

        if (result_four.time === null) {
            runResult.seq_success = 2;
            console.log(`[${runResult.branch} v=${runResult.v_idx} w=${runResult.w_idx} a=${runResult.a_idx}] FAILED at crane collision`);
            return false;
        }

        // Calculate vectors for seq_four
        const v_b_angle_rad = (result_four.phi - result_four.beta + 90) * (Math.PI / 180);
        const v_k_angle_rad = (result_four.theta + result_four.beta) * (Math.PI / 180);

        const v_b_four = new Vector2D(Math.cos(v_b_angle_rad), Math.sin(v_b_angle_rad))
            .scale(result_seq_three.omega_b_prime * r_one);
        const v_k_four = new Vector2D(Math.cos(v_k_angle_rad), Math.sin(v_k_angle_rad))
            .scale(crane_v_bomb);

        runResult.vectors = { v_b: v_b_four, v_k: v_k_four };

        if (!isFinite(v_b_four.x) || !isFinite(v_k_four.x)) {
            runResult.seq_success = 3;
            console.log(`[${runResult.branch} v=${runResult.v_idx} w=${runResult.w_idx} a=${runResult.a_idx}] FAILED at vector calc`);
            return false;
        }

        setVal('seq4_vb', `(${v_b_four.x.toFixed(2)},${v_b_four.y.toFixed(2)})`);
        setVal('seq4_vk', `(${v_k_four.x.toFixed(2)},${v_k_four.y.toFixed(2)})`);

        // seq_four
        const result_seq_four = seq_four(
            v_b_four, v_k_four,
            seq4_rho_i, seq4_rho_a, seq4_ri, seq4_Ra,
            m_car, result_seq_three.I, seq4_rc, seq4_k
        );

        runResult.seq_four = {
            input: { rho_i: seq4_rho_i, rho_a: seq4_rho_a, ri: seq4_ri, Ra: seq4_Ra },
            result: result_seq_four
        };

        if (!result_seq_four.vk_final || !isFinite(result_seq_four.vk_final.x)) {
            runResult.seq_success = 4;
            console.log(`[${runResult.branch} v=${runResult.v_idx} w=${runResult.w_idx} a=${runResult.a_idx}] FAILED at seq_four`);
            return false;
        }

        // seq_five
        const result_final = seq_five(
            seq5_x_off, seq5_y_off,
            phi - beta_one, r_one,
            result_seq_four.vk_final
        );

        runResult.seq_five = {
            input: { x_off: seq5_x_off, y_off: seq5_y_off, crane_angle: phi - beta_one },
            result: result_final
        };

        if (!isFinite(result_final.eta_offset) || !isFinite(result_final.eta_vector)) {
            runResult.seq_success = 4;  // technically seq_five failed
            console.log(`[${runResult.branch} v=${runResult.v_idx} w=${runResult.w_idx} a=${runResult.a_idx}] FAILED at seq_five`);
            return false;
        }

        // SUCCESS
        runResult.seq_success = 5;
        runResult.eta_angle = result_final.delta_eta_deg;

        setVal('seq5_v_ges', `(${result_seq_four.vk_final.x.toFixed(2)},${result_seq_four.vk_final.y.toFixed(2)})`);

        if (!ignoreDebugLog) {
            console.log(`[${runResult.branch}] SUCCESS - Eta: ${runResult.eta_angle.toFixed(2)}°`);
        }

        return true;
    }

    // main loop: iterators v (speed), w (winkel/angle), a (acceleration)
    for (let v = 0; v < v_steps; v++) {
        for (let w = 0; w < w_steps; w++) {
            for (let a = -5; a <= a_steps; a++) {

                const c_speed = v_values[v];
                const c_angle = w_values[w];

                if (a === 0) {
                    // NEUTRAL MODEL
                    const runResult = createRunResult(v, w, a, c_speed, c_angle, 0, 'NEUTRAL');

                    const result_neutral = seq_two(
                        1, c_angle, c_speed, t_input, y_target, tolerance
                    );

                    runResult.seq_two = {
                        input: { mode: 1, angle: c_angle, speed: c_speed },
                        result: result_neutral
                    };

                    if (!result_neutral.withinTolerance || !isFinite(result_neutral.velocity)) {
                        runResult.seq_success = 0;
                        runResults.push(runResult);
                        continue;
                    }

                    runCollisionSequence(runResult, result_neutral);
                    runResults.push(runResult);

                } else if (a > 0) {
                    // ACCELERATION MODEL
                    const c_a = a_values[a];
                    if (c_a === undefined) continue;

                    const runResult = createRunResult(v, w, a, c_speed, c_angle, c_a, 'ACCEL');

                    const result_accel = seq_two(
                        2, c_angle, c_speed, t_input, y_target, tolerance, c_a
                    );

                    runResult.seq_two = {
                        input: { mode: 2, angle: c_angle, speed: c_speed, accel: c_a },
                        result: result_accel
                    };

                    if (!result_accel.withinTolerance || !isFinite(result_accel.velocity)) {
                        runResult.seq_success = 0;
                        runResults.push(runResult);
                        continue;
                    }

                    runCollisionSequence(runResult, result_accel);
                    runResults.push(runResult);

                } else if (a < 0) {
                    // DECELERATION MODEL
                    const c_cw = cw_values[Math.abs(a)];
                    const c_cw_A = cw_A_values[Math.abs(a)];
                    if (c_cw === undefined || c_cw_A === undefined) continue;

                    const runResult = createRunResult(v, w, a, c_speed, c_angle, c_cw, 'DECEL');

                    const result_decel = seq_two(
                        3, c_angle, c_speed, t_input, y_target, tolerance,
                        0, (c_cw_A * rho * c_cw) / (2 * m_car),
                        rho, c_cw_A, c_cw, m_car, g
                    );

                    runResult.seq_two = {
                        input: { mode: 3, angle: c_angle, speed: c_speed, cw: c_cw, cw_A: c_cw_A },
                        result: result_decel
                    };

                    if (!result_decel.withinTolerance || !isFinite(result_decel.velocity)) {
                        runResult.seq_success = 0;
                        runResults.push(runResult);
                        continue;
                    }

                    runCollisionSequence(runResult, result_decel);
                    runResults.push(runResult);
                }
            }
        }
    }

    // print stats and render plot :O :D
    const stats = getResultsStats(runResults);
    console.log("=== PIPELINE COMPLETE ===");
    console.log("Stats:", stats);

    renderResultsPlot(runResults);
}

//TODO Remove after testing
/*
const ignoreDebugLog = true;
const debugVectors = false;

function runPipeline() {
    // read seq_one params from UI
    const x_one = getVal('seq1_x');
    const y_one = getVal('seq1_y');
    const b = getVal('seq1_b');
    const phi = getVal('seq1_phi');
    const sigma = getVal('seq1_sigma');

    const sigma_max = seq_one(x_one, y_one, b, phi).delta;
    const beta_one = seq_one(x_one, y_one, b, phi).beta;

    // update calculated fields in UI //TODO display in such a way?
    setVal('seq1_sigma_max', sigma_max);
    setVal('seq1_beta', beta_one);

    console.log("Maximaler Sigma-Wert:", sigma_max);
    const t_one = seq_one(x_one, y_one, b, phi, sigma_max).t;
    const tau_one = seq_one(x_one, y_one, b, phi, sigma_max).tau;
    const r_one = seq_one(x_one, y_one, b, phi, sigma_max).r;

    setVal('seq1_t', t_one);
    setVal('seq1_tau', tau_one);
    setVal('seq1_r', r_one);
    setVal('seq2_t_input', t_one);
    setVal('seq3_r_impact', r_one);
    setVal('seq3_tau_deg', tau_one);
    setVal('seq5_r', r_one);
    setVal('seq5_crane_angle', phi - beta_one);

    // read interval settings from UI
    const v_initial_max = getVal('v_initial_max');
    const v_initial_min = getVal('v_initial_min');
    const v_steps = Math.floor(getVal('v_steps'));
    const v_inital_values = splitInterval(v_initial_min, v_initial_max, v_steps, true);

    const alpha_initial_max = getVal('alpha_initial_max');
    const alpha_initial_min = getVal('alpha_initial_min');
    const alpha_steps = Math.floor(getVal('alpha_steps'));
    const alpha_initial_values = splitInterval(alpha_initial_min, alpha_initial_max, alpha_steps, true);

    const a_initial_min = getVal('a_initial_min');
    const a_initial_max = getVal('a_initial_max');
    const a_steps = Math.floor(getVal('a_steps'));
    const a_initial_values = splitInterval(a_initial_min, a_initial_max, a_steps, true);

    const cw_initial_min = getVal('cw_initial_min');
    const cw_initial_max = getVal('cw_initial_max');
    const cw_A_initial_min = getVal('cw_A_initial_min');
    const cw_A_initial_max = getVal('cw_A_initial_max');
    const cw_initial_values = splitInterval(cw_initial_min, cw_initial_max, 5, true).reverse();
    const cw_A_initial_values = splitInterval(cw_A_initial_min, cw_A_initial_max, 5, true).reverse();

    // read seq_two params from UI
    const m_car = getVal('seq2_m_car');
    const g = getVal('seq2_g');
    const rho = getVal('seq2_rho');
    const tolerance = getVal('seq2_tolerance');
    const t_input = t_one;
    const y_target = getVal('seq2_y_target');

    setVal('seq3_mc', m_car);
    setVal('seq4_m', m_car);

    // read seq_three params from UI
    const seq3_m_boom = getVal('seq3_m_boom');
    const seq3_l_boom = getVal('seq3_l_boom');
    const seq3_l_offset = getVal('seq3_l_offset');
    const seq3_l_weight = getVal('seq3_l_weight');
    const seq3_m_weight = getVal('seq3_m_weight');
    const seq3_vb = getVal('seq3_vb');
    const seq3_k = getVal('seq3_k');

    // read crane collision params from UI
    const crane_x_off = getVal('crane_x_off');
    const crane_y_off = getVal('crane_y_off');
    const crane_r = getVal('crane_r');
    const crane_alpha_0 = getVal('crane_alpha_0');
    const crane_v_bomb = getVal('crane_v_bomb');
    const crane_T_offset = getVal('crane_T_offset');

    // read seq_four params from UI
    const seq4_rho_i = getVal('seq4_rho_i');
    const seq4_rho_a = getVal('seq4_rho_a');
    const seq4_ri = getVal('seq4_ri');
    const seq4_Ra = getVal('seq4_Ra');
    const seq4_rc = getVal('seq4_rc');
    const seq4_k = getVal('seq4_k');

    // read seq_five params from UI
    const seq5_x_off = getVal('seq5_x_off');
    const seq5_y_off = getVal('seq5_y_off');

    let c_angle, c_speed, c_a, c_cw, c_cw_A;

    // helper function for the collision sequence execution
    function runCollisionSequence(branchName, result_trajectory) {
        // seq_three
        const result_seq_three = seq_three(
            seq3_m_boom, seq3_l_boom, seq3_l_offset, seq3_l_weight, seq3_m_weight,
            r_one, m_car, result_trajectory.velocity, tau_one, seq3_vb, seq3_k
        );

        if (!isFinite(result_seq_three.vbPrime) || !isFinite(result_seq_three.I)) {
            console.log(`[${branchName}] FAILED at seq_three: Invalid vbPrime or I`);
            return null;
        }

        setVal('seq3_vc', result_trajectory.velocity);
        setVal('seq4_Ic', result_seq_three.I);
        setVal('crane_omega', result_seq_three.vbPrime / r_one);

        if (!ignoreDebugLog) {
            console.log("Seq Three Result:", result_seq_three);
            console.log("Input speed: ", result_trajectory.velocity);
            console.log(result_seq_three.vbPrime);
            console.log(result_seq_three.omega_b_prime, "rad/s");
            console.log(result_seq_three.ropt, "optimaler Radius");
        }

        // calculateCraneCollision
        const result_four = calculateCraneCollision(
            crane_x_off, crane_y_off, crane_r, crane_alpha_0,
            result_seq_three.vbPrime / r_one,
            crane_v_bomb, crane_T_offset
        );

        if (result_four.time === null) {
            console.log(`[${branchName}] FAILED at calculateCraneCollision: No collision possible`);
            return null;
        }

        console.log("Kollisionszeit:", result_four.time.toFixed(4), "Sekunden");
        console.log("Abschusswinkel deg θ:", result_four.theta.toFixed(2), "°");
        console.log("Position deg φ:", result_four.phi.toFixed(2), "°");
        console.log("-------------------------");
        console.log("beta one deg: ", result_four.beta);
        console.log("result four phi deg: ", result_four.phi);
        console.log("result four theta deg", result_four.theta);

        // Calculate vectors for seq_four
        const v_b_angle_rad = (result_four.phi - result_four.beta + 90) * (Math.PI / 180);
        const v_k_angle_rad = (result_four.theta + result_four.beta) * (Math.PI / 180);

        const v_b_four = new Vector2D(Math.cos(v_b_angle_rad), Math.sin(v_b_angle_rad))
            .scale(result_seq_three.omega_b_prime * r_one);
        const v_k_four = new Vector2D(Math.cos(v_k_angle_rad), Math.sin(v_k_angle_rad))
            .scale(crane_v_bomb);

        if (!isFinite(v_b_four.x) || !isFinite(v_k_four.x)) {
            console.log(`[${branchName}] FAILED: Invalid velocity vectors for seq_four`);
            return null;
        }

        setVal('seq4_vb', `(${v_b_four.x.toFixed(2)},${v_b_four.y.toFixed(2)})`);
        setVal('seq4_vk', `(${v_k_four.x.toFixed(2)},${v_k_four.y.toFixed(2)})`);

        if (!ignoreDebugLog) {
            console.log("v_k_angle: ", result_four.theta + beta_one);
            console.log("v_b-prime: ", result_seq_three.vbPrime);
            console.log("v_b_four:", v_b_four);
            console.log("v_k_four:", v_k_four);
        }

        // seq_four
        const result_seq_four = seq_four(
            v_b_four, v_k_four,
            seq4_rho_i, seq4_rho_a, seq4_ri, seq4_Ra,
            m_car, result_seq_three.I, seq4_rc, seq4_k
        );

        if (!result_seq_four.vk_final || !isFinite(result_seq_four.vk_final.x)) {
            console.log(`[${branchName}] FAILED at seq_four: Invalid vk_final`);
            return null;
        }

        if (!ignoreDebugLog) console.log("Seq Four Result:", result_seq_four);

        // seq_five
        const result_final = seq_five(
            seq5_x_off, seq5_y_off,
            phi - beta_one, r_one,
            result_seq_four.vk_final
        );

        if (!isFinite(result_final.eta_offset) || !isFinite(result_final.eta_vector)) {
            console.log(`[${branchName}] FAILED at seq_five: Invalid eta values`);
            return null;
        }

        setVal('seq5_v_ges', `(${result_seq_four.vk_final.x.toFixed(2)},${result_seq_four.vk_final.y.toFixed(2)})`);

        console.log(`[${branchName}] SUCCESS - Final Result:`, result_final);
        return result_final;
    }

    // main loop
    for (let i = 0; i < v_steps; i++) {
        for (let j = 0; j < alpha_steps; j++) {
            for (let k = -5; k <= a_steps; k++) {

                if (k === 0) {
                    // NEUTRAL MODEL
                    c_speed = v_inital_values[i];
                    c_angle = alpha_initial_values[j];

                    const result_neutral = seq_two(
                        1, c_angle, c_speed, t_input, y_target, tolerance
                    );

                    if (!result_neutral.withinTolerance) {
                        console.log(`[NEUTRAL i=${i} j=${j}] Skipped: Outside tolerance`);
                        continue;
                    }

                    if (!isFinite(result_neutral.velocity)) {
                        console.log(`[NEUTRAL i=${i} j=${j}] FAILED at seq_two: Invalid velocity`);
                        continue;
                    }

                    if (!ignoreDebugLog)console.log("Neutral Model - Speed:", c_speed, "Angle:", c_angle, "Result:", result_neutral);


                    const finalResult = runCollisionSequence(
                        `NEUTRAL i=${i} j=${j} speed=${c_speed.toFixed(2)} angle=${c_angle.toFixed(2)}`,
                        result_neutral
                    );

                    if (finalResult === null){
                        console.log(`[NEUTRAL i=${i} j=${j}] FAILED; Collision sequence failed`);
                        continue;
                    }

                } else if (k > 0) {
                    // ACCELERATION MODEL
                    c_speed = v_inital_values[i];
                    c_angle = alpha_initial_values[j];
                    c_a = a_initial_values[k];

                    if (c_a === undefined){
                        console.log(`[ACCEL i=${i} j=${j} k=${k}] Skipped: Undefined acceleration`);
                        continue;
                    }

                    const result_accel = seq_two(
                        2, c_angle, c_speed, t_input, y_target, tolerance, c_a
                    );

                    if (!result_accel.withinTolerance) {
                        console.log(`[NEUTRAL i=${i} j=${j}] Skipped: Outside tolerance`);
                        continue;
                    }

                    if (!isFinite(result_accel.velocity)) {
                        console.log(`[ACCEL i=${i} j=${j} k=${k}] FAILED at seq_two: Invalid velocity`);
                        continue;
                    }

                    if (!ignoreDebugLog) {
                        console.log("Acceleration Model - Speed:", c_speed, "Angle:", c_angle, "Acceleration:", c_a, "Result:", result_accel);
                    }

                    const finalResult = runCollisionSequence(
                        `ACCEL i=${i} j=${j} k=${k} speed=${c_speed.toFixed(2)} angle=${c_angle.toFixed(2)} a=${c_a.toFixed(2)}`,
                        result_accel
                    );

                    if (finalResult === null){
                      console.log(`[ACCEL i=${i} j=${j} k=${k}] FAILED; Collision sequence failed`);
                        continue;
                    }

                } else if (k < 0) {
                    // DECELERATION MODEL
                    c_speed = v_inital_values[i];
                    c_angle = alpha_initial_values[j];
                    c_cw = cw_initial_values[Math.abs(k)];
                    c_cw_A = cw_A_initial_values[Math.abs(k)];

                    if (c_cw === undefined || c_cw_A === undefined) continue;

                    const result_decel = seq_two(
                        3, c_angle, c_speed, t_input, y_target, tolerance,
                        0,
                        (c_cw_A * rho * c_cw) / (2 * m_car),
                        rho, c_cw_A, c_cw, m_car, g
                    );

                    if (!result_decel.withinTolerance) {
                        console.log(`[DECEL i=${i} j=${j} k=${k}] Skipped: Outside tolerance`);
                        continue;
                    }

                    if (!isFinite(result_decel.velocity)) {
                        console.log(`[DECEL i=${i} j=${j} k=${k}] FAILED at seq_two: Invalid velocity`);
                        continue;
                    }

                    if (!ignoreDebugLog) {
                        console.log("Deceleration Model - Speed:", c_speed, "Angle:", c_angle, "Cw:", c_cw, "Cw_A:", c_cw_A, "Result:", result_decel);
                    }

                    const finalResult = runCollisionSequence(
                        `DECEL i=${i} j=${j} k=${k} speed=${c_speed.toFixed(2)} angle=${c_angle.toFixed(2)} cw=${c_cw.toFixed(2)}`,
                        result_decel
                    );

                    if (finalResult === null){
                        console.log(`[DECEL i=${i} j=${j} k=${k}] FAILED; Collision sequence failed`);
                        continue;
                    }

                } else {
                    if (!ignoreDebugLog) console.log("error in acceleration loop");
                }
            }
        }
    }

    console.log("Pipeline complete.");
}*/
