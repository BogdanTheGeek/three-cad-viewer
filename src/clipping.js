import * as THREE from "three";


function ShapeToBufferGeometry(shape) {
    const positions =
        shape.vertices instanceof Float32Array
            ? shape.vertices
            : new Float32Array(shape.vertices.flat());
    const normals =
        shape.normals instanceof Float32Array
            ? shape.normals
            : new Float32Array(shape.normals.flat());
    const triangles =
        shape.triangles instanceof Uint32Array
            ? shape.triangles
            : new Uint32Array(shape.triangles.flat());

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
    );
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(triangles, 1));

    return geometry;
}

function createPlaneStencilGroup(geometry, plane, renderOrder, group, loc) {


    const [pos, rot] = LocToQat(loc);

    const baseMat = new THREE.MeshBasicMaterial();
    baseMat.depthWrite = false;
    baseMat.depthTest = false;
    baseMat.colorWrite = false;
    baseMat.stencilWrite = true;
    baseMat.stencilFunc = THREE.AlwaysStencilFunc;

    // back faces
    const mat0 = baseMat.clone();
    mat0.side = THREE.BackSide;
    mat0.clippingPlanes = [plane];
    mat0.stencilFail = THREE.IncrementWrapStencilOp;
    mat0.stencilZFail = THREE.IncrementWrapStencilOp;
    mat0.stencilZPass = THREE.IncrementWrapStencilOp;

    const mesh0 = new THREE.Mesh(geometry, mat0);
    //mesh0.position.copy(pos);
    //mesh0.quaternion.copy(rot);
    //mesh0.renderOrder = renderOrder;
    group.add(mesh0);

    // front faces
    const mat1 = baseMat.clone();
    mat1.side = THREE.FrontSide;
    mat1.clippingPlanes = [plane];
    mat1.stencilFail = THREE.DecrementWrapStencilOp;
    mat1.stencilZFail = THREE.DecrementWrapStencilOp;
    mat1.stencilZPass = THREE.DecrementWrapStencilOp;

    const mesh1 = new THREE.Mesh(geometry, mat1);
    //mesh1.position.copy(pos);
    //mesh1.quaternion.copy(rot);
    //mesh1.renderOrder = renderOrder;

    group.add(mesh1);
    return group;
}

function flatten(parts, loc = [[0, 0, 0], [0, 0, 0, 1]]) {
    let flatList = [];
    for (let part of parts) {
        if (Object.hasOwn(part, "parts")) {
            const [oldPos, oldRot] = LocToQat(loc);
            const [pos, rot] = LocToQat(part.loc);
            const newPos = oldPos.clone().add(pos.clone().applyQuaternion(oldRot));
            const newRot = oldRot.clone().multiply(rot);
            const newLoc = [newPos.toArray(), newRot.toArray()];
            flatList = flatList.concat(flatten(part.parts, newLoc));
        }
        else {
            flatList.push([part, part.loc ? part.loc : loc]);
        }
    }
    return flatList;
}

function createPlaneHelper(normal, distance, size, color) {
    const planeGeom = new THREE.PlaneGeometry(size, size);
    const planeMat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.1,
        roughness: 0.75,
        opacity: 0.5,
        transparent: true,
        side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeom, planeMat);
    plane.renderOrder = 100 + Math.random() * 0.1;
    plane.lookAt(normal);
    plane.position.copy(normal.clone().multiplyScalar(distance));
    return plane;
}

function LocToQat(loc) {
    const pos = new THREE.Vector3(...loc[0]);
    const rot = new THREE.Quaternion(...loc[1]);
    return [pos, rot];
}

class Clipping {

    constructor(center, size, distance, uiCallback, theme, nestedGroup, scene) {
        this.distance = distance;
        this.uiCallback = uiCallback;

        const normals = [
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, -1, 0),
            new THREE.Vector3(0, 0, -1)
        ];
        const axisColors = [0xff0000, 0x00ff00, 0x0000ff];

        this.clipPlanes = [];
        this.clipAxis = [];
        this.planeHelpers = new THREE.Group();
        this.helpers = [];

        for (var i = 0; i < 3; i++) {
            this.clipPlanes.push(new THREE.Plane(normals[i], distance));
            this.clipAxis.push({ stencils: [], pos: [], rot: [] });
            this.uiCallback(i, normals[i].toArray());
            this.helpers.push(createPlaneHelper(normals[i], distance, size, 0xeeeeee));
            this.planeHelpers.add(this.helpers[i]);
        }

        console.log("nestedGroup", nestedGroup);
        let parts = flatten(nestedGroup.shapes.parts);
        console.log("parts", parts);

        for (let [part, loc] of parts) {
            let shape = part.shape;
            let geometry;
            try {
                geometry = ShapeToBufferGeometry(shape);
            } catch (e) {
                console.error(e);
                console.error("Failed to create geometry for part", part);
                continue;
            }

            const [pos, rot] = LocToQat(loc);

            const planeGeom = new THREE.PlaneGeometry(size, size);

            let stencilGroup = new THREE.Group();
            let poGroup = new THREE.Group();

            for (let i = 0; i < 3; i++) {
                const plane = this.clipPlanes[i];
                const otherPlanes = this.clipPlanes.filter((_, j) => j !== i);

                stencilGroup = createPlaneStencilGroup(geometry, plane, i + 1, stencilGroup, loc);

                const planeMat =
                    new THREE.MeshStandardMaterial({

                        //color: axisColors[i],
                        color: part.color,
                        metalness: 0.1,
                        roughness: 0.75,
                        clippingPlanes: otherPlanes,

                        stencilWrite: true,
                        stencilRef: 0,
                        stencilFunc: THREE.NotEqualStencilFunc,
                        stencilFail: THREE.ReplaceStencilOp,
                        stencilZFail: THREE.ReplaceStencilOp,
                        stencilZPass: THREE.ReplaceStencilOp,
                        side: THREE.DoubleSide

                    });

                const planeMat2 = new THREE.MeshNormalMaterial({
                        clippingPlanes: otherPlanes,

                        stencilWrite: true,
                        stencilRef: 0,
                        stencilFunc: THREE.NotEqualStencilFunc,
                        stencilFail: THREE.ReplaceStencilOp,
                        stencilZFail: THREE.ReplaceStencilOp,
                        stencilZPass: THREE.ReplaceStencilOp,
                        side: THREE.DoubleSide

                });
                const po = new THREE.Mesh(planeGeom, planeMat2);
                //po.lookAt(plane.normal.clone().negate());
                po.onAfterRender = function(renderer) {
                    renderer.clearStencil();
                };

                //po.renderOrder = i + 1.1;

                poGroup.add(po);
                this.clipAxis[i].stencils.push(po);
                this.clipAxis[i].pos.push(pos);
                this.clipAxis[i].rot.push(rot);
            }
            shape.clipping = poGroup;
            shape.stencilGroup = stencilGroup;

        }
    }

    setConstant(index, value) {
        const normal = this.clipPlanes[index].normal.clone();
        this.setPlaneOrientation(index, normal, value, -1);
    }

    setNormal(index, normal) {
        const value = this.clipPlanes[index].constant;
        this.setPlaneOrientation(index, normal, value, 1);
        this.uiCallback(index, normal.toArray());
    }

    setPlaneOrientation(index, normal, value, dir = 1) {
        this.clipPlanes[index].normal = normal;
        this.clipPlanes[index].constant = value;

        if (Math.abs(value) < 1e-8) value = 1e-8;

        const direction = normal.clone();
        const newPos = direction.multiplyScalar(value * dir);
        const planeOrientation = newPos.clone().normalize();

        this.helpers[index].position.copy(newPos);
        this.helpers[index].lookAt(planeOrientation);


        for (let i = 0; i < this.clipAxis[index].stencils.length; i++) {
            const pos = this.clipAxis[index].pos[i];
            const rot = this.clipAxis[index].rot[i];
            console.log('rot',rot);
            console.log('i',i);
            this.clipAxis[index].stencils[i].position.copy(new THREE.Vector3(0,0,0));
            this.clipAxis[index].stencils[i].quaternion.copy(new THREE.Quaternion(0,0,0,1).multiply(rot));
            this.clipAxis[index].stencils[i].lookAt(planeOrientation);
            this.clipAxis[index].stencils[i].position.copy(newPos);
            //this.clipAxis[index].stencils[i].quaternion.multiply(rot.invert());
            //console.log(".quaternion",this.clipAxis[index].stencils[i].quaternion);
            //console.log('.position',this.clipAxis[index].stencils[i].position);
            //console.log('normal',normal);
            //console.log('pos',pos);
        }
    }
}


export { Clipping };
