const { useState, useEffect, useRef } = React;
const Plotly = window.Plotly;

const CraneBallPort = () => {

    // Parameters
    const [params, setParams] = useState({
        x_off: 20.0,
        y_off: -5.0,
        r: 5.0,
        alpha_0: 45, // degrees
        omega: 0.10408033771302085,
        v: 15,
        T_offset: 0.15
    });

    const [results, setResults] = useState(null);
    const [animationFrame, setAnimationFrame] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const animationRef = useRef(null);
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    // Math helper functions
    const rad = (deg) => deg * Math.PI / 180;
    const deg = (rad) => rad * 180 / Math.PI;

    const calculate = () => {
        const { x_off, y_off, r, alpha_0, omega, v, T_offset } = params;
        const alpha_0_rad = rad(alpha_0);

        // Coordinate transformation
        const u = -Math.sqrt(x_off ** 2 + y_off ** 2);
        const rotation_angle = Math.atan2(y_off, x_off);
        const alpha_start = (Math.PI / 2 - alpha_0_rad) - rotation_angle;

        // h_theta function
        const h_theta = (theta) => {
            const sin_theta = Math.sin(theta);
            const cos_theta = Math.cos(theta);
            const discriminant = r ** 2 - u ** 2 * sin_theta ** 2;

            if (discriminant < 0) return Infinity;
            return -u * cos_theta + Math.sqrt(discriminant);
        };

        // theta_from_T function
        const theta_from_T = (T) => {
            if (T === 0 || Math.abs(T) < 1e-10) return NaN;
            const arg = -(u ** 2 + (T * v) ** 2 - r ** 2) / (2 * u * T * v);
            if (arg < -1 || arg > 1) return NaN;
            return Math.acos(arg);
        };

        // P_kugel function
        const P_kugel = (theta) => {
            const h = h_theta(theta);
            const x = h * Math.cos(theta) + u;
            const y = h * Math.sin(theta);
            return [x, y];
        };

        // phi_kugel function
        const phi_kugel = (T) => {
            const theta = theta_from_T(T);
            if (isNaN(theta)) return NaN;
            const [x, y] = P_kugel(theta);
            const phi = Math.atan2(y, x);
            if (phi < 0 || phi > Math.PI / 2) return NaN;
            return phi;
        };

        // phi_kran function
        const phi_kran = (T, skip_normalization = false) => {
            let phi;
            if (T < T_offset) {
                phi = alpha_start;
            } else {
                phi = alpha_start + omega * (T - T_offset);
            }
            if (!skip_normalization) {
                phi = phi % (2 * Math.PI);
            }
            return phi;
        };

        // delta_phi function
        const delta_phi = (T) => {
            const phi_k = phi_kugel(T);
            const phi_kr = phi_kran(T);
            if (isNaN(phi_k)) return Infinity;
            if (phi_kr < 0 || phi_kr > Math.PI / 2) return Infinity;
            return phi_k - phi_kr;
        };

        // Validity range
        const theta_min = 0.0;
        const h_min = h_theta(theta_min);
        const T_min = h_min / v;

        const theta_max = Math.atan(r / Math.abs(u));
        const h_max = h_theta(theta_max);
        const T_max = h_max / v;

        // Guard clause check
        const T_check_min = Math.min(T_min, T_max);
        const T_check_max = Math.max(T_min, T_max);

        const T_kran_start_effective = Math.max(T_check_min, T_offset);
        const rotation_duration = T_kran_start_effective >= T_check_max ? 0 : T_check_max - T_kran_start_effective;

        const phi_kran_start = alpha_start + omega * Math.max(0, T_check_min - T_offset);
        const phi_kran_end = alpha_start + omega * Math.max(0, T_check_max - T_offset);
        const delta_phi_kran = phi_kran_end - phi_kran_start;

        let collision_possible = false;

        if (Math.abs(delta_phi_kran) >= Math.PI / 2) {
            collision_possible = true;
        } else {
            const phi_start_mod = phi_kran_start % (2 * Math.PI);
            const phi_end_mod = phi_kran_end % (2 * Math.PI);
            const segment_min = 0.0;
            const segment_max = Math.PI / 2;

            if (omega >= 0) {
                if (phi_start_mod <= phi_end_mod) {
                    if (phi_start_mod <= segment_max && phi_end_mod >= segment_min) {
                        collision_possible = true;
                    }
                } else {
                    collision_possible = true;
                }
            } else {
                if (phi_end_mod <= phi_start_mod) {
                    if (phi_end_mod <= segment_max && phi_start_mod >= segment_min) {
                        collision_possible = true;
                    }
                } else {
                    if (segment_min <= phi_start_mod || segment_max >= phi_end_mod) {
                        collision_possible = true;
                    }
                }
            }
        }

        // Newton-Raphson
        const delta_phi_derivative = (T, epsilon = 1e-6) => {
            return (delta_phi(T + epsilon) - delta_phi(T - epsilon)) / (2 * epsilon);
        };

        const newton_raphson = (T_initial, T_min_bound, T_max_bound, tol = 1e-3, max_iter = 20) => {
            let T_current = T_initial;

            for (let iteration = 0; iteration < max_iter; iteration++) {
                const function_value = delta_phi(T_current);
                if (Math.abs(function_value) < tol) return [T_current, iteration + 1];

                const derivative_value = delta_phi_derivative(T_current);
                if (Math.abs(derivative_value) < 1e-10) return [null, iteration + 1];

                const T_next = T_current - function_value / derivative_value;
                if (T_next < T_min_bound || T_next > T_max_bound) return [null, iteration + 1];

                T_current = T_next;
            }
            return [null, max_iter];
        };

        // Bisection
        const bisection = (T_left_start, T_right_start, tol = 1e-3, max_iter = 50) => {
            let T_left = T_left_start;
            let T_right = T_right_start;
            let f_left = delta_phi(T_left);
            let f_right = delta_phi(T_right);

            if (f_left * f_right > 0) return [null, 0];

            for (let iteration = 0; iteration < max_iter; iteration++) {
                const T_mid = (T_left + T_right) / 2;
                const f_mid = delta_phi(T_mid);

                if (Math.abs(f_mid) < tol) return [T_mid, iteration + 1];
                if ((T_right - T_left) / 2 < tol) return [T_mid, iteration + 1];

                if (f_left * f_mid < 0) {
                    T_right = T_mid;
                    f_right = f_mid;
                } else {
                    T_left = T_mid;
                    f_left = f_mid;
                }
            }
            return [(T_left + T_right) / 2, max_iter];
        };

        // Find collision
        let T_optimal = null;
        let method_used = '';
        let iters = 0;

        if (collision_possible) {
            const T_lower = Math.min(T_min, T_max);
            const T_upper = Math.max(T_min, T_max);
            const T0 = (T_lower + T_upper) / 2;

            [T_optimal, iters] = newton_raphson(T0, T_lower, T_upper, 1e-6);

            if (T_optimal !== null) {
                method_used = 'Newton-Raphson';
            } else {
                // Bisection fallback
                const T_samples = [];
                for (let i = 0; i < 100; i++) {
                    T_samples.push(T_lower + (T_upper - T_lower) * i / 99);
                }
                const delta_phi_samples = T_samples.map(t => delta_phi(t));

                let T_a = null, T_b = null;
                for (let i = 0; i < delta_phi_samples.length - 1; i++) {
                    if (!isFinite(delta_phi_samples[i]) || !isFinite(delta_phi_samples[i + 1])) continue;
                    if (delta_phi_samples[i] * delta_phi_samples[i + 1] < 0) {
                        T_a = T_samples[i];
                        T_b = T_samples[i + 1];
                        break;
                    }
                }

                if (T_a !== null) {
                    [T_optimal, iters] = bisection(T_a, T_b, 1e-6);
                    method_used = 'Bisection';
                }
            }
        }

        const theta_opt = T_optimal ? theta_from_T(T_optimal) : theta_min;
        const [x_opt, y_opt] = T_optimal ? P_kugel(theta_opt) : P_kugel(theta_min);
        const phi_k_opt = T_optimal ? phi_kugel(T_optimal) : NaN;
        const phi_kr_opt = T_optimal ? phi_kran(T_optimal) : phi_kran(T_min);

        return {
            u, rotation_angle, alpha_start,
            T_min, T_max, theta_min, theta_max,
            T_optimal, method_used, iters,
            theta_opt, phi_k_opt, phi_kr_opt,
            x_opt, y_opt, r,
            collision_possible,
            // Functions for plotting
            h_theta, theta_from_T, P_kugel, phi_kugel, phi_kran, delta_phi
        };
    };

    useEffect(() => {
        const res = calculate();
        setResults(res);
    }, [params]);

    // Create plots
    useEffect(() => {
        if (!results) return;

        const { T_min, T_max, T_optimal, delta_phi, phi_kugel, phi_kran, theta_from_T } = results;
        const T_lower = Math.min(T_min, T_max);
        const T_upper = Math.max(T_min, T_max);

        // Plot 1: Error function
        const T_range = [];
        for (let i = 0; i < 200; i++) {
            T_range.push(T_lower + (T_upper - T_lower) * i / 199);
        }

        const delta_phi_values = T_range.map(t => {
            const val = delta_phi(t);
            return isFinite(val) ? deg(val) : null;
        });

        const trace1 = {
            x: T_range,
            y: delta_phi_values,
            mode: 'lines',
            name: 'Δφ(T)',
            line: { color: 'blue', width: 2 }
        };

        const shapes1 = [
            { type: 'line', x0: T_lower, x1: T_upper, y0: 0, y1: 0, line: { color: 'gray', dash: 'dash' } }
        ];

        if (T_optimal) {
            shapes1.push({
                type: 'line',
                x0: T_optimal,
                x1: T_optimal,
                y0: -10,
                y1: 10,
                line: { color: 'red', dash: 'dash', width: 2 }
            });
        }

        Plotly.newPlot('plot1', [trace1], {
            title: `Error Function (${results.method_used})`,
            xaxis: { title: 'Time T [s]' },
            yaxis: { title: 'Angle Difference Δφ [°]' },
            shapes: shapes1,
            margin: { t: 40, b: 40, l: 50, r: 20 }
        }, { responsive: true });

        // Plot 2: Geometry
        const segment_theta = [];
        const segment_x = [];
        const segment_y = [];
        for (let i = 0; i <= 100; i++) {
            const theta = Math.PI / 2 * i / 100;
            segment_theta.push(theta);
            segment_x.push(results.r * Math.cos(theta));
            segment_y.push(results.r * Math.sin(theta));
        }

        const traces2 = [
            {
                x: segment_x,
                y: segment_y,
                mode: 'lines',
                name: 'Arc Segment',
                line: { color: 'orange', width: 4 }
            },
            {
                x: [0],
                y: [0],
                mode: 'markers',
                name: 'Pivot M',
                marker: { color: 'black', size: 10 }
            },
            {
                x: [results.u],
                y: [0],
                mode: 'markers',
                name: 'Ball Start U',
                marker: { color: 'green', size: 10 }
            }
        ];

        if (T_optimal) {
            traces2.push({
                x: [results.u, results.x_opt],
                y: [0, results.y_opt],
                mode: 'lines',
                name: 'Ball Path',
                line: { color: 'green', dash: 'dash', width: 2 }
            });
            traces2.push({
                x: [results.x_opt],
                y: [results.y_opt],
                mode: 'markers',
                name: 'Collision',
                marker: { color: 'red', size: 10 }
            });

            const arm_x = results.r * Math.cos(results.phi_kr_opt);
            const arm_y = results.r * Math.sin(results.phi_kr_opt);
            traces2.push({
                x: [0, arm_x],
                y: [0, arm_y],
                mode: 'lines',
                name: 'Crane Arm',
                line: { color: 'blue', width: 3 }
            });
        }

        Plotly.newPlot('plot2', traces2, {
            title: 'Geometry (Rotated System)',
            xaxis: { title: 'x [m]', scaleanchor: 'y' },
            yaxis: { title: 'y [m]' },
            margin: { t: 40, b: 40, l: 50, r: 20 }
        }, { responsive: true });

        // Plot 3: Angle functions
        const T_plot_end = Math.max(T_min, T_max) * 1.1;
        const T_func_range = [];
        for (let i = 0; i < 300; i++) {
            T_func_range.push(T_plot_end * i / 299);
        }

        const phi_kugel_vals = T_func_range.map(t => {
            const val = phi_kugel(t);
            return isNaN(val) ? null : deg(val);
        });

        const phi_kran_vals = T_func_range.map(t => deg(phi_kran(t, true)));
        const theta_vals = T_func_range.map(t => {
            const val = theta_from_T(t);
            return isNaN(val) ? null : deg(val);
        });

        const traces3 = [
            {
                x: T_func_range,
                y: phi_kugel_vals,
                mode: 'lines',
                name: 'φ_ball(T)',
                line: { color: 'orange', width: 2.5 }
            },
            {
                x: T_func_range,
                y: phi_kran_vals,
                mode: 'lines',
                name: 'φ_crane(T)',
                line: { color: 'blue', width: 2.5 }
            },
            {
                x: T_func_range,
                y: theta_vals,
                mode: 'lines',
                name: 'θ(T)',
                line: { color: 'green', width: 2 }
            }
        ];

        const shapes3 = [
            { type: 'line', x0: 0, x1: T_plot_end, y0: 0, y1: 0, line: { color: 'black', dash: 'dot' } },
            { type: 'line', x0: 0, x1: T_plot_end, y0: 90, y1: 90, line: { color: 'black', dash: 'dot' } }
        ];

        if (T_optimal) {
            shapes3.push({
                type: 'line',
                x0: T_optimal,
                x1: T_optimal,
                y0: -10,
                y1: 100,
                line: { color: 'red', dash: 'dash', width: 2 }
            });
        }

        Plotly.newPlot('plot3', traces3, {
            title: 'Angle Functions over Time',
            xaxis: { title: 'Time T [s]' },
            yaxis: { title: 'Angle [°]', range: [-10, 100] },
            shapes: shapes3,
            margin: { t: 40, b: 40, l: 50, r: 20 }
        }, { responsive: true });

    }, [results]);

    // Animation
    useEffect(() => {
        if (!isAnimating || !results || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const { T_min, T_max, T_optimal, r, u, theta_opt, phi_kran, theta_from_T, P_kugel, phi_kugel, collision_possible, h_theta } = results;
        const t_anim_end = T_optimal ? Math.max(T_optimal * 1.3, params.T_offset + 0.5) : Math.max(Math.abs(T_min), Math.abs(T_max)) * 1.2;

        const fallback_theta = 0;
        const fallback_T = h_theta(fallback_theta) / params.v;

        const totalFrames = 200;
        const freezeFrames = 30;
        const fps = 30;

        let t;
        if (T_optimal) {
            const collision_frame = Math.floor((T_optimal / t_anim_end) * totalFrames);
            if (animationFrame >= collision_frame && animationFrame < collision_frame + freezeFrames) {
                t = T_optimal;
            } else if (animationFrame >= collision_frame + freezeFrames) {
                t = ((animationFrame - freezeFrames) / totalFrames) * t_anim_end;
            } else {
                t = (animationFrame / totalFrames) * t_anim_end;
            }

            if (animationFrame >= totalFrames + freezeFrames) {
                setAnimationFrame(0);
                return;
            }
        } else {
            t = (animationFrame / totalFrames) * t_anim_end;
            if (animationFrame >= totalFrames) {
                setAnimationFrame(0);
                return;
            }
        }

        const animate = () => {
            ctx.clearRect(0, 0, width, height);

            // Transform to center coordinate system
            const scale = Math.min(width, height) / (2 * (r + Math.abs(u)) * 1.2);
            const centerX = width / 2 - (u * scale) / 2;
            const centerY = height / 2;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.scale(scale, -scale);

            // AXES
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1.5 / scale;
            ctx.setLineDash([10 / scale, 5 / scale]);
            ctx.beginPath();
            ctx.moveTo(u - 2, 0);
            ctx.lineTo(r + 2, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -2);
            ctx.lineTo(0, r + 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Circle
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, 2 * Math.PI);
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 1 / scale;
            ctx.stroke();

            // Arc segment
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI / 2);
            ctx.strokeStyle = 'orange';
            ctx.lineWidth = 4 / scale;
            ctx.stroke();

            // Pivot
            ctx.beginPath();
            ctx.arc(0, 0, 0.2, 0, 2 * Math.PI);
            ctx.fillStyle = 'black';
            ctx.fill();

            // Ball start
            ctx.beginPath();
            ctx.arc(u, 0, 0.2, 0, 2 * Math.PI);
            ctx.fillStyle = 'green';
            ctx.fill();

            // Crane arm
            const phi_kr = phi_kran(t);
            const arm_x = r * Math.cos(phi_kr);
            const arm_y = r * Math.sin(phi_kr);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(arm_x, arm_y);
            ctx.strokeStyle = 'blue';
            ctx.lineWidth = 3 / scale;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(arm_x, arm_y, 0.2, 0, 2 * Math.PI);
            ctx.fillStyle = 'blue';
            ctx.fill();

            // possible position on arc (phi_kugel)
            const phi_k = phi_kugel(t);
            if (!isNaN(phi_k)) {
                const yellow_x = r * Math.cos(phi_k);
                const yellow_y = r * Math.sin(phi_k);
                ctx.beginPath();
                ctx.arc(yellow_x, yellow_y, 0.2, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(200, 170, 0, 1)';
                ctx.lineWidth = 2 / scale;
                ctx.stroke();
            }

            // Linear trajectory
            const display_theta = T_optimal ? theta_opt : fallback_theta;
            const display_T_max = T_optimal ? T_optimal : fallback_T;

            if (t <= display_T_max) {
                const x_lin = u + params.v * Math.cos(display_theta) * t;
                const y_lin = params.v * Math.sin(display_theta) * t;

                ctx.beginPath();
                ctx.moveTo(u, 0);
                ctx.lineTo(x_lin, y_lin);
                ctx.strokeStyle = 'green';
                ctx.lineWidth = 2 / scale;
                ctx.setLineDash([5 / scale, 5 / scale]);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.arc(x_lin, y_lin, 0.18, 0, 2 * Math.PI);
                ctx.fillStyle = 'lime';
                ctx.fill();
            } else {
                const x_lin = u + params.v * Math.cos(display_theta) * display_T_max;
                const y_lin = params.v * Math.sin(display_theta) * display_T_max;

                ctx.beginPath();
                ctx.moveTo(u, 0);
                ctx.lineTo(x_lin, y_lin);
                ctx.strokeStyle = 'green';
                ctx.lineWidth = 2 / scale;
                ctx.setLineDash([5 / scale, 5 / scale]);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.arc(x_lin, y_lin, 0.18, 0, 2 * Math.PI);
                ctx.fillStyle = 'lime';
                ctx.fill();
            }

            ctx.restore();

            // Text overlay
            ctx.fillStyle = 'black';
            ctx.font = '16px monospace';
            ctx.fillText(`T = ${t.toFixed(3)}s`, 10, 25);
            ctx.fillText(`φ_crane = ${deg(phi_kr).toFixed(1)}°`, 10, 50);
            if (!isNaN(phi_k)) {
                ctx.fillText(`φ_ball = ${deg(phi_k).toFixed(1)}°`, 10, 75);
            }
            ctx.fillText(`θ = ${deg(display_theta).toFixed(1)}°`, 10, 100);

            if (T_optimal && Math.abs(t - T_optimal) < 0.02) {
                ctx.fillStyle = 'red';
                ctx.font = 'bold 20px monospace';
                ctx.fillText('COLLISION', 10, 130);
            }

            setAnimationFrame(f => f + 1);
        };

        animationRef.current = setInterval(animate, 1000 / fps);

        return () => {
            if (animationRef.current) clearInterval(animationRef.current);
        };
    }, [isAnimating, animationFrame, results, params]);

    return (
        <div className="p-4 max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-4">Crane-Ball Collision Simulator</h1>

            {/* Controls */}
            <div className="bg-white p-4 rounded shadow mb-4">
                <h2 className="text-xl font-semibold mb-3">Parameters</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(params).map(([key, value]) => (
                        <div key={key}>
                            <label className="block text-sm font-medium mb-1">
                                {key.replace('_', ' ')}
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                value={value}
                                onChange={(e) => setParams({...params, [key]: parseFloat(e.target.value) || 0})}
                                className="w-full px-2 py-1 border rounded"
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Results */}
            {results && (
                <div className="bg-blue-50 p-4 rounded shadow mb-4">
                    <h2 className="text-xl font-semibold mb-2">Results</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div><strong>Method:</strong> {results.method_used}</div>
                        <div><strong>Iterations:</strong> {results.iters}</div>
                        <div><strong>T_collision:</strong> {results.T_optimal?.toFixed(4) || 'N/A'}s</div>
                        <div><strong>Collision:</strong> {results.collision_possible ? '✓ Possible' : '✗ Impossible'}</div>
                    </div>
                </div>
            )}

            {/* Plots */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div id="plot1" className="bg-white p-2 rounded shadow" style={{height: '400px'}}></div>
                <div id="plot2" className="bg-white p-2 rounded shadow" style={{height: '400px'}}></div>
                <div id="plot3" className="bg-white p-2 rounded shadow" style={{height: '400px'}}></div>
                <div className="bg-white p-2 rounded shadow flex items-center justify-center" style={{height: '400px'}}>
                    <p className="text-gray-500">Original coordinates plot placeholder</p>
                </div>
            </div>

            {/* Animation */}
            <div className="bg-white p-4 rounded shadow">
                <h2 className="text-xl font-semibold mb-3">Animation</h2>
                <div className="flex gap-2 mb-2">
                    <button
                        onClick={() => setIsAnimating(!isAnimating)}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        {isAnimating ? 'Pause' : 'Play'}
                    </button>
                    <button
                        onClick={() => setAnimationFrame(0)}
                        className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                        Reset
                    </button>
                </div>
                <div ref={containerRef} className="w-full">
                    <canvas
                        ref={canvasRef}
                        width={1400}
                        height={900}
                        className="border border-gray-300 w-full h-auto"
                        style={{display: 'block', maxWidth: '100%'}}
                    />
                </div>
            </div>
        </div>
    );
};


window.CraneBallPort = CraneBallPort;